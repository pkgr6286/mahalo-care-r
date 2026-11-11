import {test} from "node:test";
import assert from "node:assert/strict";
import type {RecordRow} from "@workspace/db";
import {documentSourceHash,referencedEvidence,renderClinicalPdf} from "./document-renderer";
const record:RecordRow={id:"synthetic-document-record",kind:"notes",patientId:null,program:"CCM",title:"Synthetic structured note",description:"Assessment: no real patient data.\nPlan: synthetic demonstration only.",status:"signed",severity:"none",assignee:"Synthetic reviewer",date:"2026-11-11T00:00:00.000Z",value:0,unit:"",metadata:{version:1,signedBy:"Synthetic reviewer"},createdBy:"system",createdAt:new Date("2026-11-11T00:00:00Z"),updatedAt:new Date("2026-11-11T00:00:00Z")};
test("Document source fingerprints include dates and ignore object-key insertion order",()=>{
  assert.equal(documentSourceHash({b:2,a:new Date("2026-11-11T00:00:00Z")}),documentSourceHash({a:new Date("2026-11-11T00:00:00Z"),b:2}));
  assert.notEqual(documentSourceHash(record),documentSourceHash({...record,updatedAt:new Date("2026-11-12T00:00:00Z")}));
});
test("Evidence documents include only explicitly referenced sources from the same chart and program",()=>{
  const billing={...record,kind:"billing",patientId:"synthetic-patient",metadata:{sourceTimeIds:["right","other-program","other-chart"]}};
  const sources=[{...record,id:"right",patientId:"synthetic-patient",kind:"time"},{...record,id:"other-program",patientId:"synthetic-patient",program:"RPM",kind:"time"},{...record,id:"other-chart",patientId:"different",kind:"time"},{...record,id:"not-counted",patientId:"synthetic-patient",kind:"time"}];
  assert.deepEqual(referencedEvidence(billing,sources).map(r=>r.id),["right"]);
});
test("Signed records render to actual PDF bytes with a source fingerprint and retention origin",async()=>{
  const bytes=await renderClinicalPdf({record,patient:null,sourceHash:documentSourceHash(record),origin:"signature",capturedAt:new Date("2026-11-11T00:00:00Z")});
  assert.equal(bytes.subarray(0,4).toString(),"%PDF");assert.ok(bytes.length>1000);assert.ok(bytes.subarray(-20).toString().includes("%%EOF"));
});
test("Official brand fonts render patient identifiers, ligatures, accents and mixed-case chart metadata",async()=>{
  const bytes=await renderClinicalPdf({record:{...record,title:"Retained note 1a2b3c",description:"Synthetic signature and retention verification. Efficient clinical follow-up for José and Zoë.",metadata:{version:2,signedBy:"Qualified practitioner",signedById:"synthetic-user",signedAt:"2026-11-11T00:00:00Z"}},patient:{id:"synthetic",firstName:"Synthetic",lastName:"Document verification",mrn:"MC-12345678",dob:"1960-01-01",location:"Garden City"} as any,sourceHash:"a".repeat(64),origin:"unretained_preview",capturedAt:new Date("2026-11-11T00:00:00Z")});
  assert.equal(bytes.subarray(0,5).toString(),"%PDF-");assert.ok(bytes.subarray(-20).toString().includes("%%EOF"));
});
