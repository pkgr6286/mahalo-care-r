import PDFDocument from "pdfkit";
import {createHash} from "node:crypto";
import type {RecordRow,PatientRow} from "@workspace/db";
import {applyDocumentBrand} from "./document-assets";
import {renderSecurityReportPdf} from "./security-report-pdf";
import {renderClinicalDocumentContent} from "./clinical-document-content";

export const documentSourceHash=(value:unknown)=>{
  const canonical=(v:unknown):unknown=>v instanceof Date?v.toISOString():Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,canonical(x)])):v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
};
export function referencedEvidence(record:RecordRow,all:RecordRow[]) {
  const ids=new Set(["sourceTimeIds","sourceObservationIds","sourceSupplyIds","sourceInteractionIds","sourceResponseIds","sourceEnrollmentIds","sourcePlanIds","sourceConsentIds","sourceDeviceIds"].flatMap(key=>Array.isArray(record.metadata[key])?(record.metadata[key] as unknown[]).map(String):[]));
  return all.filter(r=>r.patientId===record.patientId&&r.program===record.program&&ids.has(r.id));
}
export async function renderClinicalPdf({record,patient,supporting=[],sourceHash,origin,capturedAt}:{record:RecordRow;patient:PatientRow|null;supporting?:RecordRow[];sourceHash:string;origin:string;capturedAt:Date}) {
  const pdf=new PDFDocument({size:"LETTER",margin:54,bufferPages:true,info:{Title:record.title,Author:"Mahalo Care — synthetic demonstration",CreationDate:capturedAt,ModDate:capturedAt}});
  const bytes:Buffer[]=[];
  const result=new Promise<Buffer>((resolve,reject)=>{pdf.on("data",chunk=>bytes.push(Buffer.from(chunk)));pdf.on("end",()=>resolve(Buffer.concat(bytes)));pdf.on("error",reject);});
  applyDocumentBrand(pdf);
  pdf.moveTo(54,79).lineTo(558,79).lineWidth(2).strokeColor("#EB782F").stroke();
  pdf.y=95;pdf.font("MahaloSans").fontSize(8).fillColor("#6F6560").text("SYNTHETIC DATA ONLY  /  NOT FOR CLINICAL USE");
  pdf.moveDown(1.2).font("MahaloSerif").fontSize(22).fillColor("#181A1C").text(record.title);
  if(origin==="unretained_preview") pdf.moveDown(0.5).font("MahaloSans").fontSize(10).fillColor("#9B491B").text("UNRETAINED DRAFT / PROVISIONAL PREVIEW");
  if(origin==="readable_presentation")pdf.moveDown(.5).font("MahaloSans").fontSize(8).fillColor("#6F6560").text("Readable presentation of a previously retained source. This file was generated on the capture date below; the earlier captured bytes remain in version history.");
  if(patient) pdf.moveDown(0.7).font("MahaloSans").fontSize(10).text(`${patient.firstName} ${patient.lastName}  |  ${patient.mrn}  |  DOB ${patient.dob}`).text(`${patient.location}  |  ${record.program??"General"}`);
  pdf.moveDown(1.2).font("MahaloSans").fontSize(10.5).fillColor("#323237").text(record.description||"No narrative recorded.",{lineGap:4});
  const hidden=new Set(["sourceTimeIds","sourceObservationIds","sourceSupplyIds","sourceInteractionIds","sourceResponseIds","sourceEnrollmentIds","sourcePlanIds","sourceConsentIds","sourceDeviceIds","policySnapshot","sourceIds","sectionValues","templateSections","fingerprint"]);
  if(record.kind==="security_reports")renderSecurityReportPdf(pdf,record.metadata.securityReport);
  const clinical=["careplans","notes","consents","billing"].includes(record.kind);
  if(clinical)renderClinicalDocumentContent(pdf,record.metadata,patient?.timezone??"America/New_York");
  for(const [key,value] of record.kind==="security_reports"||clinical?[]:Object.entries(record.metadata)) {
    if(hidden.has(key)||value===undefined||value===null) continue;
    const label=key.replace(/([a-z])([A-Z])/g,"$1 $2").replaceAll("_"," ");
     pdf.moveDown(0.7).font("MahaloSans").fontSize(8.5).fillColor("#6F6560").text(label.toUpperCase());
     pdf.font("MahaloSans").fontSize(10).fillColor("#323237");
    if(Array.isArray(value)) value.forEach(item=>pdf.text(`• ${typeof item==="object"?JSON.stringify(item):String(item)}`,{lineGap:2}));
    else pdf.text(typeof value==="object"?JSON.stringify(value,null,2):String(value),{lineGap:2});
  }
  if(record.kind==="billing") {
    pdf.moveDown().font("MahaloSerif").fontSize(13).text("Contributing source evidence");
    if(!supporting.length) pdf.moveDown(0.5).font("MahaloSans").fontSize(9).text("No contributing source records were captured in this evidence snapshot.");
    for(const row of supporting.slice(0,200)) pdf.moveDown(0.5).font("MahaloSans").fontSize(9).text(`${row.date}  |  ${row.kind}  |  ${row.title}\n${row.value} ${row.unit}  |  ${row.status}  |  ${row.id}`,{lineGap:2});
    if(supporting.length>200) pdf.moveDown().fontSize(9).text(`Showing 200 of ${supporting.length} contributing sources. The authenticated source manifest retains the complete captured source set.`);
  }
  pdf.moveDown(2).font("MahaloSans").fontSize(8).fillColor("#6F6560").text(`Record ${record.id}\nRecord status: ${record.status} | Source version: ${record.metadata.version??1}\nSigned/captured by: ${record.metadata.signedBy??record.metadata.capturedBy??"Not signed"}\nRetention origin: ${origin}\nSource-content SHA-256: ${sourceHash}`,{lineGap:2});
  if(origin==="legacy_capture") pdf.moveDown(0.8).text("Legacy record: these bytes were retained after the original event. This is not a claim that the original file bytes were preserved at signature.");
  const range=pdf.bufferedPageRange();
  for(let i=range.start;i<range.start+range.count;i++) {
    pdf.switchToPage(i);
    pdf.font("MahaloSans").fontSize(7).fillColor("#6F6560").text(`Mahalo Care · synthetic demonstration                                               ${i+1} / ${range.count}`,54,740,{lineBreak:false});
  }
  pdf.end();return result;
}
