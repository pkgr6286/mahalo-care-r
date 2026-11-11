import {createHash} from "node:crypto";
import {privateStorageClient} from "./object-storage-client";
import {uploadPrivateDocument,downloadPrivateDocument} from "./document-object-store";
import {AppError} from "./errors";
import {validateIncomingAttachmentMetadata,validateSupportingPdf} from "./attachment-validation";
function incoming(id:string,generation?:string){
  if(!/^[a-f0-9-]{36}$/i.test(id))throw new AppError(400,"Invalid upload identifier");
  const root=process.env.PRIVATE_OBJECT_DIR;
  if(!root)throw new AppError(503,"Private storage is unavailable");
  const [bucket,...prefix]=root.replace(/^\/+|\/+$/g,"").split("/");
  if(!bucket||!prefix.length)throw new AppError(503,"Private storage is unavailable");
  const objectName=`${prefix.join("/")}/incoming-supporting-files/${id}`;
  return {bucket,objectName,file:privateStorageClient().bucket(bucket).file(objectName,generation?{generation}:undefined)};
}
export async function attachmentUploadUrl(id:string){
  const target=incoming(id),expiresAt=new Date(Date.now()+5*60000);
  if(process.env.STORAGE_DRIVER==="gcp"){
    const [uploadURL]=await target.file.getSignedUrl({version:"v4",action:"write",expires:expiresAt,contentType:"application/pdf"});
    return {uploadURL,expiresAt:expiresAt.toISOString()};
  }
  // Same Replit-provided signing contract as ObjectStorageService; credential setup remains unchanged.
  const response=await fetch("http://127.0.0.1:1106/object-storage/signed-object-url",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({bucket_name:target.bucket,object_name:target.objectName,method:"PUT",expires_at:expiresAt.toISOString()}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new AppError(503,"The private upload ticket could not be created");
  const result=await response.json() as {signed_url?:string};
  if(!result.signed_url)throw new AppError(503,"The private upload ticket could not be created");
  return {uploadURL:result.signed_url,expiresAt:expiresAt.toISOString()};
}
export async function sealAttachment(id:string,owner:string,declaredSize:number){
  let generation:string;
  try{
    const [metadata]=await incoming(id).file.getMetadata();generation=String(metadata.generation??"");
    if(!generation)throw new Error("Missing upload generation");
    try{validateIncomingAttachmentMetadata(metadata.size,metadata.contentEncoding,declaredSize);}
    catch(error){
      await incoming(id,generation).file.delete({ignoreNotFound:true}).catch(()=>{});
      throw error;
    }
    const [bytes]=await incoming(id,generation).file.download({validation:"crc32c"});
    const sha256=validateSupportingPdf(bytes,declaredSize);
    // The signed PUT URL can never overwrite the final sealed object. Separate namespaces also prevent caller-chosen document-ID collisions.
    const digest=createHash("sha256").update(`supporting-attachment:${id}`).digest("hex").slice(0,32);
    const sealedId=`${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20)}`;
    const stored=await uploadPrivateDocument(sealedId,owner,bytes,sha256);
    // Keep the private incoming generation until lifecycle cleanup: deleting it before
    // the database commits would make a transient finalize failure impossible to retry.
    return {...stored,sha256};
  }catch(error){
    if(error instanceof AppError)throw error;
    throw new AppError(503,"The private upload is not readable yet; retry completion after the upload finishes");
  }
}
export const readAttachment=downloadPrivateDocument;
