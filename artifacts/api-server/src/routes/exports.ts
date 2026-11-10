import { Router } from "express";
import PDFDocument from "pdfkit";
import { createHash } from "node:crypto";
import { db, patients, audit } from "@workspace/db";
import { allRecords, getRecord, getPatientRow, writeAudit, type Actor } from "../lib/store";
import { AppError } from "../lib/errors";
import ExcelJS from "exceljs";

export const exportsRouter=Router();
function csvCell(v:unknown) {
  let value=typeof v==="object"?JSON.stringify(v):String(v??"");
  if(/^[=+\-@\t\r]/.test(value)) value="'"+value;
  return `"${value.replaceAll('"','""')}"`;
}
exportsRouter.get("/exports/:kind",async (req,res):Promise<void>=>{
  const kind=String(req.params.kind), actor=res.locals.actor as Actor;
  if(kind==="configuration") {
    const reference=(await allRecords()).filter(r=>["programs","templates","rules","locations","education","instruments"].includes(r.kind)&&!r.patientId);
    await writeAudit(db,actor,"export_configuration","practice");
    res.setHeader("Content-Disposition",'attachment; filename="mahalo-configuration.json"');
    res.type("application/json").send(JSON.stringify({version:1,dataClass:"synthetic",records:reference.map(({kind,title,description,program,metadata})=>({kind,title,description,program,metadata}))},null,2));return;
  }
  if(!["billing","patients","audit"].includes(kind)) throw new AppError(404,"Unknown export type");
  const ps=await db.select().from(patients);
  const rows:Record<string,unknown>[]=kind==="patients"?ps:kind==="audit"?await db.select().from(audit):(await allRecords(db,"billing")).map(r=>({...r,patientName:ps.find(p=>p.id===r.patientId)?.lastName,...r.metadata}));
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
exportsRouter.get("/documents/:id",async (req,res):Promise<void>=>{
  const record=await getRecord(db,String(req.params.id));
  if(!["careplans","notes","billing","consents"].includes(record.kind)) throw new AppError(400,"This record is not an exportable document");
  const patient=record.patientId?await getPatientRow(db,record.patientId):null;
  await writeAudit(db,res.locals.actor as Actor,"download_document",record.id,record.patientId);
  res.setHeader("Content-Disposition",`attachment; filename="mahalo-${record.kind}-${record.id.slice(0,8)}.pdf"`);
  res.type("application/pdf");
  const pdf=new PDFDocument({size:"LETTER",margin:54,info:{Title:record.title,Author:"Mahalo Care — synthetic demo"}});
  pdf.pipe(res);
  pdf.fontSize(11).fillColor("#3D36E8").text("MAHALO CARE");
  pdf.moveDown().fontSize(23).fillColor("#071C3B").text(record.title);
  pdf.moveDown().fontSize(10).fillColor("#64748B").text("SYNTHETIC DATA ONLY · NOT FOR CLINICAL USE");
  if(patient) pdf.moveDown().fillColor("#071C3B").text(`${patient.firstName} ${patient.lastName} | ${patient.mrn} | DOB ${patient.dob}`).text(`Location: ${patient.location} | Program: ${record.program||"General"}`);
  pdf.moveDown().fillColor("#334155").fontSize(11).text(record.description||"No narrative recorded.",{lineGap:5});
  for(const [key,value] of Object.entries(record.metadata)) {
    if(["sourceTimeIds","sourceObservationIds","sourceIds"].includes(key)) continue;
    pdf.moveDown(0.5).fontSize(10).text(`${key.replaceAll("_"," ")}: ${typeof value==="object"?JSON.stringify(value):String(value??"—")}`);
  }
  if(record.kind==="billing"&&patient) {
    pdf.moveDown().fontSize(15).text("Supporting evidence");
    for(const row of (await allRecords()).filter(r=>r.patientId===patient.id&&r.program===record.program&&["time","observations","interactions"].includes(r.kind))) {
      pdf.moveDown(0.4).fontSize(9).text(`${row.date.slice(0,16)} | ${row.kind} | ${row.title} | ${row.value} ${row.unit} | ${row.status}`);
    }
  }
  const hash=createHash("sha256").update(JSON.stringify({id:record.id,description:record.description,metadata:record.metadata})).digest("hex");
  pdf.moveDown(2).fontSize(8).fillColor("#64748B").text(`Record ${record.id}\nStatus: ${record.status} | Version: ${record.metadata.version||1}\nSigned by: ${record.metadata.signedBy||"Unsigned draft"}\nSource-content SHA-256: ${hash}`);
  pdf.end();
});
