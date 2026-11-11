import { Router } from "express";
import {isReleasedPatientDocument} from "../lib/document-access";
import { createHash } from "node:crypto";
import { db, patients, audit } from "@workspace/db";
import { allRecords, getRecord, getPatientRow, writeAudit, type Actor } from "../lib/store";
import { AppError } from "../lib/errors";
import ExcelJS from "exceljs";
import { scopedPatients, scopedRecords, hasPermission, assertPatientAccess } from "../lib/access";
import { validatePeriod } from "../lib/billing";
import {captureDocument,storedDocument,retainedDocuments,documentHistory,isRetainable} from "../lib/document-store";
import {renderClinicalPdf,documentSourceHash,referencedEvidence} from "../lib/document-renderer";
import type {Request,Response} from "express";
import {exportConfiguration} from "../lib/configuration";

export const exportsRouter=Router();
function csvCell(v:unknown) {
  let value=typeof v==="object"?JSON.stringify(v):String(v??"");
  if(/^\s*[=+\-@]/.test(value)||/^[\t\r\n]/.test(value)) value="'"+value;
  return `"${value.replaceAll('"','""')}"`;
}
exportsRouter.get("/exports/:kind",async (req,res):Promise<void>=>{
  const kind=String(req.params.kind), actor=res.locals.actor as Actor;
  if(kind==="configuration") {
    const backup=await exportConfiguration(db);
    await writeAudit(db,actor,"export_configuration","practice");
    res.setHeader("Content-Disposition",'attachment; filename="mahalo-configuration.json"');
    res.setHeader("Cache-Control","private, no-store");res.type("application/json").send(JSON.stringify(backup,null,2));return;
  }
  if(!["billing","patients","audit"].includes(kind)) throw new AppError(404,"Unknown export type");
  const ps=scopedPatients(actor,await db.select().from(patients)),visibleIds=new Set(ps.map(p=>p.id));
  const period=req.query.period===undefined?undefined:validatePeriod(req.query.period);
  const rows:Record<string,unknown>[]=kind==="patients"?ps.map(p=>hasPermission(actor,"clinical.read")?p:{...p,conditions:[],medications:[]}):kind==="audit"?(await db.select().from(audit)).filter(e=>!e.patientId||visibleIds.has(e.patientId)):scopedRecords(actor,await allRecords(db,"billing"),ps).filter(r=>!period||r.metadata.period===period).map(r=>({...r,patientName:ps.find(p=>p.id===r.patientId)?.lastName,...r.metadata}));
  const columns=rows.length?Object.keys(rows[0]!):["No records"];
  await writeAudit(db,actor,`export_${kind}`,"practice");
  if(req.query.format==="xlsx") {
    const workbook=new ExcelJS.Workbook();
    workbook.creator="Mahalo Care — synthetic demo";
    const sheet=workbook.addWorksheet(kind);
    sheet.columns=columns.map(c=>({header:c,key:c,width:Math.min(40,Math.max(14,c.length+3))}));
    for(const row of rows) sheet.addRow(Object.fromEntries(columns.map(c=>[c,typeof row[c]==="object"?JSON.stringify(row[c]):row[c]])));
    sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
    sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF071C3B"}};
    sheet.views=[{state:"frozen",ySplit:1}];
    res.setHeader("Content-Disposition",`attachment; filename="mahalo-${kind}.xlsx"`);
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await workbook.xlsx.write(res);res.end();return;
  }
  res.setHeader("Content-Disposition",`attachment; filename="mahalo-${kind}.csv"`);
  res.type("text/csv").send("\uFEFF"+[columns.map(csvCell).join(","),...rows.map(row=>columns.map(c=>csvCell(row[c])).join(","))].join("\r\n"));
});
async function accessibleDocument(req:Request,res:Response) {
  const r=await getRecord(db,String(req.params.id)),actor=res.locals.actor as Actor;
  if(!["careplans","notes","billing","consents"].includes(r.kind)) throw new AppError(400,"This record is not an exportable document");
  if(r.patientId) await assertPatientAccess(actor,r.patientId);
  if(actor.role==="patient"&&!isReleasedPatientDocument(r)) throw new AppError(403,"This clinical document has not been released to your patient workspace");
  res.setHeader("Cache-Control","private, no-store");
  return r;
}
exportsRouter.get("/documents/:id/versions",async(req,res)=>{
  const r=await accessibleDocument(req,res);
  await writeAudit(db,res.locals.actor,"list_document_versions",r.id,r.patientId);
  res.json(await documentHistory(r));
});
exportsRouter.get("/documents/:id/versions/:versionId/source",async(req,res)=>{
  const r=await accessibleDocument(req,res),d=await storedDocument(r.id,String(req.params.versionId));
  await writeAudit(db,res.locals.actor,"download_document_source",r.id,r.patientId,{documentId:d.id,version:d.version,sourceHash:d.sourceHash});
  res.setHeader("Content-Disposition",`attachment; filename="mahalo-source-${r.id.slice(0,8)}-v${d.version}.json"`);
  res.json({documentId:d.id,sourceHash:d.sourceHash,source:d.sourceSnapshot});
});
exportsRouter.get("/documents/:id/versions/:versionId",async(req,res)=>{
  const r=await accessibleDocument(req,res),d=await storedDocument(r.id,String(req.params.versionId));
  await writeAudit(db,res.locals.actor,"download_document_version",r.id,r.patientId,{documentId:d.id,version:d.version,sha256:d.sha256});
  res.setHeader("Content-Disposition",`attachment; filename="mahalo-${r.kind}-${r.id.slice(0,8)}-v${d.version}.pdf"`);
  res.setHeader("X-Document-SHA256",d.sha256);res.setHeader("X-Source-SHA256",d.sourceHash);res.setHeader("X-Document-Retained","true");
  res.type("application/pdf").send(d.pdfBytes);
});
exportsRouter.get("/documents/:id",async(req,res)=>{
  const r=await accessibleDocument(req,res),actor=res.locals.actor as Actor;
  res.setHeader("Content-Disposition",`attachment; filename="mahalo-${r.kind}-${r.id.slice(0,8)}.pdf"`);
  if(isRetainable(r)) {
    if(!(await retainedDocuments(r.id)).length) await db.transaction(s=>captureDocument(s,actor,r,"legacy_capture","legacy_capture"));
    const d=await storedDocument(r.id);
    await writeAudit(db,actor,"download_document",r.id,r.patientId,{documentId:d.id,version:d.version,sha256:d.sha256});
    res.setHeader("X-Document-SHA256",d.sha256);res.setHeader("X-Source-SHA256",d.sourceHash);res.setHeader("X-Document-Retained","true");
    res.type("application/pdf").send(d.pdfBytes);return;
  }
  const patient=r.patientId?await getPatientRow(db,r.patientId):null,supporting=r.kind==="billing"?referencedEvidence(r,await allRecords()):[];
  const sourceHash=documentSourceHash({record:r,patient,supporting}),bytes=await renderClinicalPdf({record:r,patient,supporting,sourceHash,origin:"unretained_preview",capturedAt:new Date()});
  await writeAudit(db,actor,"download_unretained_document_preview",r.id,r.patientId);
  res.setHeader("X-Document-SHA256",createHash("sha256").update(bytes).digest("hex"));res.setHeader("X-Source-SHA256",sourceHash);res.setHeader("X-Document-Retained","false");
  res.type("application/pdf").send(bytes);
});
