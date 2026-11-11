import {createHash,randomUUID} from "node:crypto";
import {and,eq,desc,sql} from "drizzle-orm";
import {db,documents,records,type DocumentRow,type RecordRow} from "@workspace/db";
import {allRecords,getPatientRow,getRecord,writeAudit,type Actor,type Store} from "./store";
import {documentSourceHash,referencedEvidence,renderClinicalPdf} from "./document-renderer";
import {AppError} from "./errors";
import {uploadPrivateDocument,downloadPrivateDocument} from "./document-object-store";
import pLimit from "p-limit";
export const MAX_LOCAL_PDF_BYTES=1024*1024;
export const documentInfo=(d:DocumentRow)=>({id:d.id,recordId:d.recordId,version:d.version,sourceVersion:d.sourceVersion,origin:d.origin,sha256:d.sha256,sourceHash:d.sourceHash,size:d.size,contentType:d.contentType,storageBackend:d.storageBackend,createdAt:d.createdAt.toISOString(),createdBy:d.createdBy});
export async function installDocumentProtection() {
  await db.execute(sql`CREATE OR REPLACE FUNCTION care_protect_document() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE parent_patient text;
    BEGIN
      IF TG_OP='UPDATE' AND OLD.storage_backend='postgres_local_demo' AND NEW.storage_backend='app_storage_private'
        AND OLD.pdf_bytes IS NOT NULL AND NEW.pdf_bytes IS NULL
        AND (to_jsonb(OLD)-ARRAY['storage_backend','object_path','generation','pdf_bytes'])=(to_jsonb(NEW)-ARRAY['storage_backend','object_path','generation','pdf_bytes'])
        AND NEW.object_path='/objects/clinical-documents/'||OLD.id||'.pdf' AND NEW.generation ~ '^[0-9]+$'
        THEN RETURN NEW; END IF;
      IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Retained document versions are immutable' USING ERRCODE='23514',CONSTRAINT='care_documents_immutable'; END IF;
      IF NEW.storage_backend<>'app_storage_private' OR NEW.pdf_bytes IS NOT NULL OR NEW.content_type<>'application/pdf'
        OR NEW.size<5 OR NEW.size>1048576 OR NEW.object_path<>'/objects/clinical-documents/'||NEW.id||'.pdf' OR NEW.generation !~ '^[0-9]+$'
        OR NEW.sha256 !~ '^[a-f0-9]{64}$' OR NEW.source_hash !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'Document bytes or checksum are invalid' USING ERRCODE='23514',CONSTRAINT='care_document_bytes_valid';
      END IF;
      SELECT patient_id INTO parent_patient FROM care_records WHERE id=NEW.record_id;
      IF NEW.patient_id IS DISTINCT FROM parent_patient THEN RAISE EXCEPTION 'Document ownership does not match its record' USING ERRCODE='23514',CONSTRAINT='care_document_owner_valid'; END IF;
      RETURN NEW;
    END $$`);
  await db.execute(sql`DROP TRIGGER IF EXISTS care_document_protection ON care_documents`);
  await db.execute(sql`CREATE TRIGGER care_document_protection BEFORE INSERT OR UPDATE OR DELETE ON care_documents FOR EACH ROW EXECUTE FUNCTION care_protect_document()`);
}
type CaptureEntry={record:RecordRow;origin:string;eventKey:string};
type PreparedCapture={prior:DocumentRow}|{record:RecordRow;bytes:Buffer;values:Omit<typeof documents.$inferInsert,"objectPath"|"generation">};
async function prepareCapture(s:Store,actor:Actor,r:RecordRow,origin:string,eventKey:string,evidence?:RecordRow[]):Promise<PreparedCapture> {
  // Keep the parent-row/FK lock order consistent with signature and review actions.
  await s.select({id:records.id}).from(records).where(eq(records.id,r.id)).for("key share");
  await s.execute(sql`select pg_advisory_xact_lock(hashtextextended(${r.id},931))`);
  const [prior]=await s.select().from(documents).where(and(eq(documents.recordId,r.id),eq(documents.eventKey,eventKey)));
  if(prior) return {prior};
  const patient=r.patientId?await getPatientRow(s,r.patientId):null;
  const supporting=r.kind==="billing"?referencedEvidence(r,evidence??await allRecords(s)): [];
  const source={record:r,patient:patient?{id:patient.id,firstName:patient.firstName,lastName:patient.lastName,mrn:patient.mrn,dob:patient.dob,location:patient.location,timezone:patient.timezone}:null,supporting};
  const sourceHash=documentSourceHash(source),capturedAt=new Date();
  const pdfBytes=await renderClinicalPdf({record:r,patient,supporting,sourceHash,origin,capturedAt});
  if(pdfBytes.length>MAX_LOCAL_PDF_BYTES) throw new AppError(413,"This PDF exceeds the local demo's one-megabyte document limit; no signature or billing close was committed");
  const [latest]=await s.select({version:documents.version}).from(documents).where(eq(documents.recordId,r.id)).orderBy(desc(documents.version)).limit(1);
  const id=randomUUID(),version=(latest?.version??0)+1;
  return {record:r,bytes:pdfBytes,values:{id,recordId:r.id,patientId:r.patientId,version,sourceVersion:String(r.metadata.version??1),eventKey,origin,sha256:createHash("sha256").update(pdfBytes).digest("hex"),sourceHash,size:pdfBytes.length,sourceSnapshot:JSON.parse(JSON.stringify(source)),createdBy:actor.id,createdAt:capturedAt}};
}
export async function captureDocuments(s:Store,actor:Actor,entries:CaptureEntry[]) {
  // Read shared billing evidence once. Keep database work sequential on the transaction's one connection.
  const evidence=entries.some(e=>e.record.kind==="billing")?await allRecords(s):undefined,prepared:PreparedCapture[]=[];
  for(const entry of entries)prepared.push(await prepareCapture(s,actor,entry.record,entry.origin,entry.eventKey,evidence));
  const pending=prepared.filter((p):p is Exclude<PreparedCapture,{prior:DocumentRow}>=>!("prior" in p)),limit=pLimit(6);
  // Only independent cloud I/O runs concurrently; all signatures/period changes still commit together.
  const uploaded=await Promise.all(pending.map(p=>limit(()=>uploadPrivateDocument(p.values.id!,actor.id,p.bytes,p.values.sha256))));
  const results=prepared.filter((p):p is {prior:DocumentRow}=>"prior" in p).map(p=>p.prior);
  for(let i=0;i<pending.length;i++) {
    const p=pending[i]!,stored=uploaded[i]!;
    const [saved]=await s.insert(documents).values({...p.values,...stored}).returning();
    await writeAudit(s,actor,"retain_document_version",p.record.id,p.record.patientId,{documentId:saved!.id,version:saved!.version,origin:saved!.origin,sha256:saved!.sha256,storageBackend:stored.storageBackend});
    results.push(saved!);
  }
  return results;
}
export async function captureDocument(s:Store,actor:Actor,r:RecordRow,origin:string,eventKey:string) {
  return (await captureDocuments(s,actor,[{record:r,origin,eventKey}]))[0]!;
}
export async function retainedDocuments(recordId:string) {
  return (await db.select({id:documents.id,recordId:documents.recordId,version:documents.version,sourceVersion:documents.sourceVersion,origin:documents.origin,sha256:documents.sha256,sourceHash:documents.sourceHash,size:documents.size,contentType:documents.contentType,storageBackend:documents.storageBackend,createdAt:documents.createdAt,createdBy:documents.createdBy}).from(documents).where(eq(documents.recordId,recordId)).orderBy(desc(documents.version))).map(d=>({...d,createdAt:d.createdAt.toISOString()}));
}
export async function storedDocument(recordId:string,versionId?:string) {
  const [d]=await db.select().from(documents).where(and(eq(documents.recordId,recordId),versionId?eq(documents.id,versionId):undefined)).orderBy(desc(documents.version)).limit(1);
  if(!d) throw new AppError(404,"The retained document version was not found");
  const pdfBytes=d.storageBackend==="app_storage_private"?await downloadPrivateDocument(d.objectPath,d.generation,d.size,d.sha256):d.storageBackend==="postgres_local_demo"&&d.pdfBytes?d.pdfBytes:null;
  if(!pdfBytes||createHash("sha256").update(pdfBytes).digest("hex")!==d.sha256||documentSourceHash(d.sourceSnapshot)!==d.sourceHash) throw new AppError(409,"Document integrity verification failed; this version was not released");
  return {...d,pdfBytes};
}
export function isRetainable(r:RecordRow) {
  return r.kind==="notes"&&["signed","amended","superseded"].includes(r.status)||r.kind==="careplans"&&["active","superseded","closed"].includes(r.status)||r.kind==="consents"||r.kind==="billing"&&r.metadata.closed===true;
}
export async function documentHistory(r:RecordRow) {
  const visited=new Set<string>(),history:Awaited<ReturnType<typeof retainedDocuments>>=[];
  let current=r;
  for(let depth=0;depth<50;depth++) {
    if(visited.has(current.id)) throw new AppError(409,"The clinical revision chain contains a cycle");
    visited.add(current.id);history.push(...await retainedDocuments(current.id));
    const prior=current.metadata.priorVersionId;
    if(!["notes","careplans"].includes(current.kind)||typeof prior!=="string"||!prior) return history.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    const parent=await getRecord(db,prior,current.kind);
    if(parent.patientId!==r.patientId||parent.program!==r.program) throw new AppError(409,"A prior clinical revision does not belong to this patient's program");
    current=parent;
  }
  throw new AppError(409,"The clinical revision chain exceeds the supported local history depth");
}
