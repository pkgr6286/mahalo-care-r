import {test} from "node:test";
import assert from "node:assert/strict";
import {renderClinicalDocumentContent} from "./clinical-document-content";
function collector(){
  const lines:string[]=[];const pdf={moveDown(){return this;},font(){return this;},fontSize(){return this;},fillColor(){return this;},text(s:string){lines.push(s);return this;}};
  return {lines,pdf:pdf as unknown as PDFKit.PDFDocument};
}
test("readable clinical PDFs render actual governed sections and goals instead of JSON/technical IDs",()=>{
  const {lines,pdf}=collector();
  renderClinicalDocumentContent(pdf,{templateSections:[{key:"assessment",label:"Clinical assessment"}],sectionValues:{assessment:"Home blood pressure is improving; medication reconciliation completed."},blueprint:{fluid:"Follow the prescribed daily fluid limit.",goals:[{id:"technical-goal-id",title:"Improve morning blood pressure",target:"Follow the clinician-approved individual target."}]},sourceTimeIds:["technical-time-id"],contentReviewHash:"technical-hash",signedBy:"Dr Nora Patel",signedAt:"2026-11-10T14:00:00Z"},"America/New_York");
  const text=lines.join("\n");
  assert.match(text,/Clinical assessment/);assert.match(text,/medication reconciliation completed/);assert.match(text,/Improve morning blood pressure/);
  assert.match(text,/Dr Nora Patel/);assert.match(text,/Nov 10, 2026/);
  assert.match(text,/prescribed daily fluid limit/);
  assert.doesNotMatch(text,/technical-goal-id|technical-time-id|technical-hash|\[object Object\]|\{"goals"/);
});
test("practice-only material remains disclosed and oversized clinical content fails explicitly",()=>{
  const a=collector();renderClinicalDocumentContent(a.pdf,{nonValidatedDemo:true,reviewed:true},"America/New_York");
  assert.match(a.lines.join("\n"),/not a clinically validated/);assert.ok(a.lines.includes("Yes"));
  const b=collector();assert.throws(()=>renderClinicalDocumentContent(b.pdf,{assessment:"a".repeat(100001)},"America/New_York"),/no partial signed PDF/);
});
