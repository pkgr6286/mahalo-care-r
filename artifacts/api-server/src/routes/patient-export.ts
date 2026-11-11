import { Router } from "express";
import { ZipArchive } from "archiver";
import { createHash } from "node:crypto";
import { and,eq,inArray } from "drizzle-orm";
import pLimit from "p-limit";
import { db, records, documents, audit,datasetMemberships,caregiverGrants,attachments,users } from "@workspace/db";
import { clinicalProfile } from "../lib/clinical-profile";
import { writeAudit, type Actor } from "../lib/store";
import { storedDocument } from "../lib/document-store";
import { AppError } from "../lib/errors";
import { authorize,assertPatientAccess } from "../lib/access";
import { readAttachment } from "../lib/attachment-storage";

export const patientExportRouter = Router();
/** One bounded, authenticated access package, not a scheduled database dump or backup. */
patientExportRouter.get("/patients/:id/access-export", async (req, res) => {
  const patientId = String(req.params.id), actor = res.locals.actor as Actor;
  authorize(actor,"clinical.read");
  if(actor.emergencyContext)throw new AppError(403,"Emergency access permits chart review, not a complete access-request export.");
  // One database snapshot, then object reads outside the transaction. Draft and
  // retained history make this an INTERNAL package for review, not automatic disclosure.
  const {patient,profile,history,retained,events,classifications,sharing,files}=await db.transaction(async s=>{
    const patient=await assertPatientAccess(actor,patientId,s);
    const [profile,history,retained,events,sharing,files]=await Promise.all([
      clinicalProfile(s,patientId),s.select().from(records).where(eq(records.patientId,patientId)),
      s.select().from(documents).where(eq(documents.patientId,patientId)),s.select().from(audit).where(eq(audit.patientId,patientId)),
      s.select({grant:caregiverGrants,caregiverName:users.name,caregiverEmail:users.email}).from(caregiverGrants).innerJoin(users,eq(users.id,caregiverGrants.userId)).where(eq(caregiverGrants.patientId,patientId)),
      s.select().from(attachments).where(eq(attachments.patientId,patientId)),
    ]);
    const classifications=history.length?await s.select().from(datasetMemberships).where(and(eq(datasetMemberships.entityType,"record"),inArray(datasetMemberships.entityId,history.map(r=>r.id)))):[];
    return {patient,profile,history,retained,events,classifications,sharing,files};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
  const releasedFiles=files.filter(f=>f.status==="released_demo");
  if (retained.length+releasedFiles.length > 300 || retained.reduce((n, d) => n + d.size, 0)+releasedFiles.reduce((n,f)=>n+f.sizeBytes,0) > 40 * 1024 * 1024) {
    throw new AppError(413, "This record exceeds the self-service export limit. Request a coordinated full export from the practice; no partial archive has been created.");
  }
  const limit = pLimit(4);
  const datasetById=new Map(classifications.map(c=>[c.entityId,c.dataset]));
  const documentName=(d:typeof documents.$inferSelect)=>`${datasetById.has(d.recordId)?"retained-verification-history":"clinical-documents"}/${d.recordId}-v${d.version}.pdf`;
  // Resolve and verify every private object before starting a response: an integrity error is never a truncated 'successful' ZIP.
  const pdfs = await Promise.all(retained.map(d => limit(async () => ({
    info: d, bytes: (await storedDocument(d.recordId, d.id)).pdfBytes,
  }))));
  const supporting=await Promise.all(releasedFiles.map(f=>limit(async()=>{
    if(!f.objectPath||!f.generation||!f.sha256)throw new AppError(409,"A supporting file has incomplete retained provenance; no partial archive has been created.");
    return {name:`supporting-files/${f.id}-${f.filename.replace(/[^A-Za-z0-9_. -]/g,"_")}`,info:f,bytes:await readAttachment(f.objectPath,f.generation,f.sizeBytes,f.sha256)};
  })));
  const exportedAt=new Date().toISOString();
  const json = Buffer.from(JSON.stringify({ formatVersion: 1, exportedAt, dataClass: "synthetic", patient, clinicalProfile: profile, caregiverAccessHistory:sharing,
    supportingFiles:files.map(({objectPath,generation,...f})=>({...f,includedInArchive:f.status==="released_demo",withheldReason:f.status==="released_demo"?null:"Not currently released; unsafe, revoked or unreviewed bytes are not exported."})),
    records: history.map(r=>({...r,dataset:datasetById.get(r.id)??"clinical"})), auditTrail: events }, null, 2));
  if (json.length > 20 * 1024 * 1024) throw new AppError(413, "This record needs a coordinated practice export; no partial archive has been created.");
  const manifest = {
    formatVersion: 1, patientId, mrn: patient.mrn, exportedAt,
    notice: "Synthetic demonstration. Full internal package for authorized staff review before disclosure: includes drafts and retained verification history, not all established clinical facts. Unreleased or revoked supporting bytes are withheld.",
    files: [
      { name: "patient-record.json", sha256: createHash("sha256").update(json).digest("hex"), bytes: json.length },
      ...pdfs.map(p => ({ name: documentName(p.info), sha256: p.info.sha256, sourceHash: p.info.sourceHash, bytes: p.bytes.length, documentId: p.info.id,dataset:datasetById.get(p.info.recordId)??"clinical" })),
      ...supporting.map(f=>({name:f.name,sha256:f.info.sha256,bytes:f.bytes.length,attachmentId:f.info.id})),
    ],
  };
  await writeAudit(db, actor, "export_patient_access_package", patientId, patientId, { records: history.length, documents: pdfs.length,supportingFiles:supporting.length,withheldSupportingFiles:files.length-supporting.length, manifestHash: createHash("sha256").update(JSON.stringify(manifest)).digest("hex") });
  const filename = `${patient.mrn.replace(/[^A-Za-z0-9_-]/g, "_")}-care-record.zip`;
  res.set({ "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on("error", error => { req.log.error({ error }, "Patient export stream failed"); res.destroy(error); });
  req.on("aborted", () => archive.abort());
  archive.pipe(res);
  archive.append(json, { name: "patient-record.json" });
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  for (const pdf of pdfs) archive.append(pdf.bytes, { name: documentName(pdf.info) });
  for (const file of supporting) archive.append(file.bytes,{name:file.name});
  await archive.finalize();
});
