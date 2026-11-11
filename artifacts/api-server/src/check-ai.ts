import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,pool,users,sessions} from "@workspace/db";
import {eq} from "drizzle-orm";
import {hashPassword} from "./lib/passwords";
const run=randomUUID().slice(0,8),scopedId=`ai-review-${run}`;
let passed=0;
function client() {
  let cookie="";
  return {async request(path:string,body?:unknown,expected=200,method=body===undefined?"GET":"POST") {
    const response=await fetch(`http://localhost:80/api${path}`,{method,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    if(response.headers.getSetCookie().some(c=>c.startsWith("mahalo_session="))) cookie=response.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
    const text=await response.text();assert.equal(response.status,expected,`${method} ${path}: ${text.slice(0,180)}`);passed++;return JSON.parse(text);
  }};
}
const admin=client(),scoped=client(),patient=client(),frontdesk=client();
async function main() {
  let patientId="",enrollmentId="";
  await admin.request("/auth/login",{email:"demo@mahalo.care",password:"MahaloDemo2026!"});
  await db.insert(users).values({id:scopedId,email:`${scopedId}@example.test`,name:`Synthetic scoped ${run}`,role:"care_manager",credential:"RN",locationScopes:["Garden City"],passwordHash:await hashPassword("AiReviewVerify2026!")});
  try {
    await scoped.request("/auth/login",{email:`${scopedId}@example.test`,password:"AiReviewVerify2026!"});
    const before=await scoped.request("/ai/review-metrics");
    patientId=(await admin.request("/patients",{firstName:"Synthetic",lastName:`AI ${run}`,dob:"1960-01-01",location:"Babylon",conditions:["Hypertension"],medications:["Metformin 500 mg daily"]},201)).id;
    enrollmentId=(await admin.request("/actions",{action:"enroll",patientId,program:"RPM",payload:{consent:true,deviceSharing:true}})).record.id;
    await admin.request("/actions",{action:"simulateReading",patientId,program:"RPM",payload:{systolic:150,diastolic:95}});
    const generate=async(action:string)=>(await admin.request("/actions",{action,patientId,program:"RPM"})).record;
    const draft=await generate("draftSummary");assert.equal(draft.metadata.numericEvidence.version,1);assert.equal(draft.metadata.numericCheck.unsupported.length,0);
    const check=await admin.request(`/ai/drafts/${draft.id}/check`,{finalText:"Recorded blood pressure 150/95 mmHg. The medication list records Metformin 500 mg."});assert.equal(check.status,"checked");assert.equal(check.unsupported.length,0);
    const unsupported=await admin.request(`/ai/drafts/${draft.id}/check`,{finalText:"Recorded blood pressure 150/90 mmHg and 999 minutes of care."});assert.equal(unsupported.status,"needs_review");assert.ok(unsupported.unsupported.length>=2);
    await admin.request("/actions",{action:"acceptDraft",id:draft.id},400);
    await admin.request("/actions",{action:"acceptDraft",id:draft.id,payload:{reviewConfirmed:true,finalText:" "}},400);
    await admin.request("/actions",{action:"acceptDraft",id:draft.id,payload:{reviewConfirmed:true,finalText:"999 minutes of care."}},400);
    assert.equal((await admin.request(`/records/drafts/${draft.id}`)).status,"pending");
    const text="A clinician reviewed the recorded BP 150/95 mmHg and the medication-list entry Metformin 500 mg. This is synthetic verification only.";
    const accepted=(await admin.request("/actions",{action:"acceptDraft",id:draft.id,payload:{reviewConfirmed:true,finalText:text}})).record;
    assert.equal(accepted.status,"accepted");assert.equal(accepted.description,draft.description);assert.equal(accepted.metadata.reviewedText,text);assert.equal(accepted.metadata.edited,true);assert.ok(accepted.metadata.editDistance>0);
    const note=await admin.request(`/records/notes/${accepted.metadata.acceptedRecordId}`);assert.equal(note.status,"draft");assert.equal(note.description,text);assert.equal(note.metadata.aiDraftId,draft.id);
    assert.deepEqual(await admin.request(`/documents/${note.id}/versions`),[]);
    await admin.request("/actions",{action:"acceptDraft",id:draft.id,payload:{reviewConfirmed:true}},409);
    await admin.request("/actions",{action:"rejectDraft",id:draft.id,reason:"Cannot undo an existing human decision"},409);
    const message=await generate("draftMessage");
    await admin.request("/actions",{action:"rejectDraft",id:message.id},400);
    await admin.request("/actions",{action:"rejectDraft",id:message.id,reason:"Synthetic wording is not appropriate for this case"});
    await admin.request("/actions",{action:"rejectDraft",id:message.id,reason:"Already reviewed"},409);
    const send=await generate("draftMessage");
    const sent=(await admin.request("/actions",{action:"acceptDraft",id:send.id,payload:{reviewConfirmed:true,finalText:"Synthetic secure message approved by a human reviewer."}})).record;
    const sentRecord=await admin.request(`/records/messages/${sent.metadata.acceptedRecordId}`);assert.equal(sentRecord.status,"sent");assert.equal(sentRecord.metadata.aiDraftId,send.id);
    const suggestion=await generate("suggestTime");
    const exception=(await admin.request("/actions",{action:"acceptDraft",id:suggestion.id,payload:{reviewConfirmed:true,finalText:"A synthetic derived example is 5 minutes. No time is committed.",numericOverrideReason:"Synthetic test only: a human reviewer checked a separate derived quantity; this is not actual clinical evidence."}})).record;
    assert.equal(exception.metadata.acceptanceNumericCheck.status,"needs_review");assert.equal(exception.metadata.acceptedRecordId,null);
    assert.equal((await admin.request("/records/time")).filter((r:any)=>r.patientId===patientId).length,0);
    const queue=await generate("prioritizeQueue");await admin.request("/actions",{action:"acceptDraft",id:queue.id,payload:{reviewConfirmed:true}});
    const outline=await generate("draftNote");await admin.request("/actions",{action:"rejectDraft",id:outline.id,reason:"Synthetic clinician requested a new outline"});
    await admin.request("/actions",{action:"draftNote",patientId,program:"RPM",payload:{driver:"live",syntheticConfirmed:false}},400);
    await admin.request(`/ai/drafts/${draft.id}/check`,{finalText:""},400);
    await scoped.request(`/ai/drafts/${draft.id}/check`,{finalText:text},403);
    await scoped.request("/actions",{action:"acceptDraft",id:draft.id,payload:{reviewConfirmed:true}},403);
    await scoped.request("/actions",{action:"acceptDraft",id:draft.id,patientId:"forged-patient",payload:{reviewConfirmed:true}},400);
    assert.equal((await scoped.request("/ai/review-metrics")).total,before.total);
    await patient.request("/auth/login",{email:"patient@mahalo.care",password:"MahaloDemo2026!"});await patient.request("/ai/review-metrics",undefined,403);await patient.request(`/ai/drafts/${draft.id}/check`,{finalText:text},403);
    await frontdesk.request("/auth/login",{email:"frontdesk@mahalo.care",password:"MahaloDemo2026!"});await frontdesk.request("/ai/review-metrics",undefined,403);
    const metrics=await admin.request("/ai/review-metrics");assert.ok(metrics.accepted>=4);assert.ok(metrics.rejected>=2);assert.ok(metrics.editedAccepted>=2);assert.ok(metrics.humanNumericExceptions>=1);assert.ok(metrics.capabilities.some((c:any)=>c.capability==="draftSummary"));assert.ok(metrics.limitations.some((s:string)=>s.includes("not complete factual")));
    const guard=(e:unknown)=>!!e&&typeof e==="object"&&"code" in e&&e.code==="23514"&&"constraint" in e&&e.constraint==="care_clinical_signature_immutable";
    await assert.rejects(pool.query("UPDATE care_records SET description='forged AI response' WHERE id=$1",[draft.id]),guard);
    await assert.rejects(pool.query("UPDATE care_records SET metadata=metadata||'{\"reviewedText\":\"forged human decision\"}'::jsonb WHERE id=$1",[draft.id]),guard);
    await assert.rejects(pool.query("DELETE FROM care_records WHERE id=$1",[draft.id]),guard);
  } finally {
    if(enrollmentId)await admin.request("/actions",{action:"discharge",id:enrollmentId,reason:"Synthetic AI review verification completed"});
    if(patientId)await admin.request(`/patients/${patientId}`,{status:"inactive"},200,"PATCH");
    await db.update(users).set({status:"inactive"}).where(eq(users.id,scopedId));await db.delete(sessions).where(eq(sessions.userId,scopedId));
  }
  console.log(`PASS ${passed} AI-review HTTP cases plus source/decision immutability: explicit review, edited text, numeric exceptions, no automatic signing/time, scoped metrics and guarded secure sending.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
