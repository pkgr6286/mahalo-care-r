import {db,attachments,type AttachmentRow} from "@workspace/db";
import {and,eq,desc,sql} from "drizzle-orm";
import {hasPermission,assertPatientAccess} from "./access";
import {type Actor,type Store,writeAudit} from "./store";
import {AppError} from "./errors";
import {validateAttachmentFilename} from "./attachment-validation";
import {attachmentUploadUrl,sealAttachment,readAttachment} from "./attachment-storage";
type UploadInput={uploadId:string;filename:string;sizeBytes:number;mimeType:string};
type ReviewInput={decision:"release_demo"|"reject"|"revoke"|"cancel";reason:string;expectedUpdatedAt:string;syntheticSourceConfirmed?:boolean;unscannedRiskAcknowledged?:boolean};
const reviewer=(a:Actor)=>["admin","clinical_admin"].includes(a.role);
const writer=(a:Actor)=>a.role==="patient"||hasPermission(a,"clinical.write");
export function attachmentView(r:AttachmentRow,a:Actor){
  return {id:r.id,patientId:r.patientId,filename:r.filename,sizeBytes:r.sizeBytes,mimeType:r.mimeType,status:r.status,sha256:r.sha256,
    uploadedBy:r.uploadedByName,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString(),reviewedBy:r.reviewedByName,
    reviewedAt:r.reviewedAt?.toISOString()??null,reviewReason:r.reviewReason,validationError:r.validationError,
    canCancel:writer(a)&&r.uploadedById===a.id&&["awaiting_upload","quarantined"].includes(r.status),
    canReview:reviewer(a)&&["awaiting_upload","quarantined","released_demo"].includes(r.status),canDownload:r.status==="released_demo"};
}
export async function attachmentRow(s:Store,pid:string,id:string){
  const [row]=await s.select().from(attachments).where(and(eq(attachments.id,id),eq(attachments.patientId,pid)));
  if(!row)throw new AppError(404,"Supporting file not found");
  return row;
}
async function lock(s:Store,id:string){await s.execute(sql`select pg_advisory_xact_lock(hashtext('supporting-file'),hashtext(${id}))`);}
export async function listAttachments(a:Actor,pid:string){
  await assertPatientAccess(a,pid);
  return (await db.select().from(attachments).where(eq(attachments.patientId,pid)).orderBy(desc(attachments.createdAt))).map(r=>attachmentView(r,a));
}
export async function requestAttachment(a:Actor,pid:string,input:UploadInput){
  await assertPatientAccess(a,pid);
  if(!writer(a))throw new AppError(403,"Clinical write permission is required");
  validateAttachmentFilename(input.filename);
  const row=await db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(hashtext('supporting-ticket'),hashtext(${a.id}))`);
    const [existing]=await s.select().from(attachments).where(eq(attachments.id,input.uploadId));
    if(existing){
      if(existing.patientId!==pid||existing.uploadedById!==a.id||existing.filename!==input.filename||existing.sizeBytes!==input.sizeBytes||existing.mimeType!==input.mimeType)throw new AppError(409,"Upload identifier already belongs to a different request");
      if(["rejected","canceled"].includes(existing.status))throw new AppError(409,"Choose the file again to start a new upload");
      return existing;
    }
    const usage=await s.select({count:sql<number>`count(*)::int`}).from(attachments).where(and(eq(attachments.uploadedById,a.id),sql`${attachments.createdAt}>now()-interval '1 hour'`));
    if(usage[0]!.count>=20)throw new AppError(429,"This demo permits twenty new file tickets per account per hour");
    const [created]=await s.insert(attachments).values({id:input.uploadId,patientId:pid,filename:input.filename,sizeBytes:input.sizeBytes,mimeType:input.mimeType,
      uploadedById:a.id,uploadedByName:a.name}).returning();
    await writeAudit(s,a,"request_supporting_pdf",created!.id,pid,{sizeBytes:input.sizeBytes});
    return created!;
  });
  if(row.status!=="awaiting_upload")return {attachmentId:row.id,uploadURL:null,expiresAt:new Date().toISOString(),alreadyComplete:true};
  return {attachmentId:row.id,...await attachmentUploadUrl(row.id),alreadyComplete:false};
}
export async function completeAttachment(a:Actor,pid:string,id:string){
  await assertPatientAccess(a,pid);
  const result=await db.transaction(async s=>{
    await lock(s,id);const r=await attachmentRow(s,pid,id);
    if(r.uploadedById!==a.id||!writer(a))throw new AppError(403,"Only the original uploader can finish this upload");
    if(["quarantined","released_demo","revoked"].includes(r.status))return {row:r};
    if(r.status!=="awaiting_upload")throw new AppError(409,"This upload cannot be completed");
    try{
      const sealed=await sealAttachment(id,a.id,r.sizeBytes);
      const [row]=await s.update(attachments).set({status:"quarantined",sha256:sealed.sha256,objectPath:sealed.objectPath,generation:sealed.generation,updatedAt:new Date()}).where(eq(attachments.id,id)).returning();
      await writeAudit(s,a,"quarantine_supporting_pdf",id,pid,{sha256:sealed.sha256,sizeBytes:r.sizeBytes,malwareScanned:false});
      return {row:row!};
    }catch(error){
      if(error instanceof AppError&&error.status===422){
        const [row]=await s.update(attachments).set({status:"rejected",validationError:error.message,updatedAt:new Date()}).where(eq(attachments.id,id)).returning();
        await writeAudit(s,a,"reject_invalid_supporting_pdf",id,pid,{reason:error.message});
        return {row:row!,error};
      }
      throw error;
    }
  });
  if(result.error)throw result.error;
  return attachmentView(result.row,a);
}
export async function reviewAttachment(a:Actor,pid:string,id:string,input:ReviewInput){
  await assertPatientAccess(a,pid);
  const reason=input.reason.trim();if(reason.length<20)throw new AppError(400,"Explain the decision in at least twenty characters");
  const r=await db.transaction(async s=>{
    await lock(s,id);const old=await attachmentRow(s,pid,id);
    if(old.updatedAt.toISOString()!==input.expectedUpdatedAt)throw new AppError(409,"The file changed; review its current state before deciding");
    let status:string;
    if(input.decision==="cancel"){
      if(old.uploadedById!==a.id||!writer(a))throw new AppError(403,"Only the original uploader can cancel");
      if(!["awaiting_upload","quarantined"].includes(old.status))throw new AppError(409,"Only unfinished or quarantined uploads can be canceled");
      status="canceled";
    }else{
      if(!reviewer(a))throw new AppError(403,"Only an administrator or clinical administrator can review unscanned demo files");
      if(input.decision==="release_demo"){
        if(old.status!=="quarantined")throw new AppError(409,"Only a sealed quarantined PDF can be released for this demo");
        if(input.syntheticSourceConfirmed!==true||input.unscannedRiskAcknowledged!==true)throw new AppError(400,"Explicitly confirm the synthetic source and unscanned-file risk");
        status="released_demo";
      }else if(input.decision==="reject"){
        if(!["awaiting_upload","quarantined"].includes(old.status))throw new AppError(409,"This file cannot be rejected in its current state");
        status="rejected";
      }else{
        if(old.status!=="released_demo")throw new AppError(409,"Only a released demo file can be revoked");
        status="revoked";
      }
    }
    const [updated]=await s.update(attachments).set({status,reviewReason:reason,reviewedById:a.id,reviewedByName:a.name,reviewedAt:new Date(),updatedAt:new Date()}).where(eq(attachments.id,id)).returning();
    await writeAudit(s,a,`${input.decision}_supporting_pdf`,id,pid,{reason,malwareScanned:false,syntheticSourceConfirmed:input.syntheticSourceConfirmed===true,unscannedRiskAcknowledged:input.unscannedRiskAcknowledged===true});
    return updated!;
  });
  return attachmentView(r,a);
}
export async function downloadAttachment(a:Actor,pid:string,id:string){
  await assertPatientAccess(a,pid);const r=await attachmentRow(db,pid,id);
  if(r.status!=="released_demo")throw new AppError(403,"This supporting file has not been released for demo download");
  if(!r.objectPath||!r.generation||!r.sha256)throw new AppError(409,"The supporting file has no sealed private bytes");
  const bytes=await readAttachment(r.objectPath,r.generation,r.sizeBytes,r.sha256);
  await writeAudit(db,a,"download_supporting_pdf",id,pid,{sha256:r.sha256,malwareScanned:false});
  return {row:r,bytes};
}
