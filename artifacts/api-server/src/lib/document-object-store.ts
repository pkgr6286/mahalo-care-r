import {createHash} from "node:crypto";
import {privateStorageClient} from "./object-storage-client";
import {AppError} from "./errors";
const LIMIT=1024*1024;
export const privateDocumentPath=(id:string)=>`/objects/clinical-documents/${id}.pdf`;
function file(path:string,generation?:string) {
  if(!/^\/objects\/clinical-documents\/[a-f0-9-]{36}\.pdf$/.test(path))throw new AppError(409,"Invalid retained-document object reference");
  const root=process.env.PRIVATE_OBJECT_DIR;
  if(!root)throw new AppError(503,"Private document storage is not configured");
  const [bucket,...prefix]=root.replace(/^\/+/,"").replace(/\/+$/,"").split("/");
  if(!bucket||!prefix.length)throw new AppError(503,"Private document storage directory is invalid");
  return privateStorageClient().bucket(bucket).file(`${prefix.join("/")}/${path.slice("/objects/".length)}`,generation?{generation}:undefined);
}
export async function uploadPrivateDocument(id:string,owner:string,bytes:Buffer,sha256:string) {
  if(bytes.length>LIMIT||bytes.subarray(0,5).toString()!=="%PDF-"||createHash("sha256").update(bytes).digest("hex")!==sha256)throw new AppError(400,"Document upload failed its integrity checks");
  const objectPath=privateDocumentPath(id),object=file(objectPath);
  try {
    await object.save(bytes,{resumable:false,validation:"crc32c",preconditionOpts:{ifGenerationMatch:0},
      metadata:{contentType:"application/pdf",cacheControl:"private, no-store",metadata:{"custom:aclPolicy":JSON.stringify({owner,visibility:"private"}),careDocumentId:id,sha256}}});
    const [metadata]=await object.getMetadata();
    if(!metadata.generation||Number(metadata.size)!==bytes.length)throw new Error("Storage metadata did not match the uploaded PDF");
    return {objectPath,generation:String(metadata.generation),storageBackend:"app_storage_private"};
  }catch(error){
    // A retried one-way migration may already have uploaded these exact immutable bytes.
    if(error&&typeof error==="object"&&"code" in error&&Number(error.code)===412) {
      const [metadata]=await object.getMetadata(),generation=String(metadata.generation??"");
      if(metadata.metadata?.sha256===sha256&&metadata.metadata?.careDocumentId===id&&generation) {
        await downloadPrivateDocument(objectPath,generation,bytes.length,sha256);
        return {objectPath,generation,storageBackend:"app_storage_private"};
      }
    }
    throw new AppError(503,"Private document storage could not retain this PDF. No signature or billing close was committed; retry after storage is available.");
  }
}
/** Call only after the parent clinical record's patient/role authorization. Never returns a signed public URL. */
export async function downloadPrivateDocument(path:string,generation:string,size:number,sha256:string) {
  try {
    const object=file(path,generation),[metadata]=await object.getMetadata();
    const acl=JSON.parse(String(metadata.metadata?.["custom:aclPolicy"]??"null"));
    if(acl?.visibility!=="private"||Number(metadata.size)!==size||size>LIMIT||size<5||String(metadata.generation)!==generation)throw new AppError(409,"Retained document storage metadata failed verification");
    const [bytes]=await object.download({validation:"crc32c"});
    if(bytes.length!==size||bytes.subarray(0,5).toString()!=="%PDF-"||createHash("sha256").update(bytes).digest("hex")!==sha256)throw new AppError(409,"Retained document bytes failed verification");
    return bytes;
  }catch(error){if(error instanceof AppError)throw error;throw new AppError(503,"The retained private PDF could not be read; no replacement version was generated.");}
}
