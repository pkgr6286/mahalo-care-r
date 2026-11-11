import assert from "node:assert/strict";
import "./validation-fetch";
import {randomUUID,createHash} from "node:crypto";
import {pool} from "@workspace/db";
import {documentSourceHash} from "./lib/document-renderer";
const run=randomUUID().slice(0,8);
let passed=0;
function client() {
  let cookie="";
  return {async request(path:string,body?:unknown,expected=200,method=body===undefined?"GET":"POST") {
    const res=await fetch(`http://localhost:80/api${path}`,{method,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    if(res.headers.getSetCookie().some(c=>c.startsWith("mahalo_session="))) cookie=res.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
    const bytes=Buffer.from(await res.arrayBuffer());
    assert.equal(res.status,expected,`${method} ${path}: ${res.headers.get("content-type")?.includes("pdf")?"unexpected PDF":bytes.toString().slice(0,180)}`);passed++;
    return res.headers.get("content-type")?.includes("application/pdf")?{bytes,headers:res.headers}:JSON.parse(bytes.toString());
  }};
}
const admin=client(),patient=client(),readonly=client();
async function main() {
  let patientId="",enrollmentId="";
  await admin.request("/auth/login",{email:"demo@mahalo.care",password:"MahaloDemo2026!"});
  try {
    patientId=(await admin.request("/patients",{firstName:"Synthetic",lastName:`Document ${run}`,dob:"1960-01-01",location:"Garden City",conditions:["Hypertension"]},201)).id;
    const note=await admin.request("/records/notes",{patientId,program:"RPM",title:`Retained note ${run}`,description:"Synthetic signature and retention verification. No real patient care was performed."},201);
    const preview=await admin.request(`/documents/${note.id}`);assert.equal(preview.headers.get("x-document-retained"),"false");assert.equal(preview.bytes.subarray(0,5).toString(),"%PDF-");
    assert.deepEqual(await admin.request(`/documents/${note.id}/versions`),[]);
    const changed=await admin.request(`/records/notes/${note.id}`,{description:"Synthetic updated signature and retention verification. No real patient care was performed.",expectedUpdatedAt:note.updatedAt},200,"PATCH");
    await admin.request(`/records/notes/${note.id}`,{description:"Stale update must not overwrite the draft",expectedUpdatedAt:note.updatedAt},409,"PATCH");
    await admin.request(`/records/notes/${note.id}`,{patientId:null},400,"PATCH");
    await admin.request("/actions",{action:"signNote",id:note.id,payload:{expectedUpdatedAt:note.updatedAt}},409);
    await admin.request("/actions",{action:"signNote",id:note.id,payload:{expectedUpdatedAt:changed.updatedAt}});
    const versions=await admin.request(`/documents/${note.id}/versions`);assert.equal(versions.length,1);assert.equal(versions[0].origin,"signature");assert.equal(versions[0].storageBackend,"app_storage_private");
    const first=await admin.request(`/documents/${note.id}`),again=await admin.request(`/documents/${note.id}`);
    assert.equal(first.headers.get("x-document-retained"),"true");assert.ok(first.bytes.equals(again.bytes));assert.equal(createHash("sha256").update(first.bytes).digest("hex"),versions[0].sha256);assert.equal(first.bytes.length,versions[0].size);
    const manifest=await admin.request(`/documents/${note.id}/versions/${versions[0].id}/source`);assert.equal(documentSourceHash(manifest.source),manifest.sourceHash);assert.equal(manifest.source.record.metadata.signedById,"demo-admin");assert.equal(manifest.source.patient.lastName,`Document ${run}`);
    await admin.request(`/patients/${patientId}`,{lastName:`Renamed ${run}`},200,"PATCH");
    assert.ok((await admin.request(`/documents/${note.id}`)).bytes.equals(first.bytes));
    const amendment=await admin.request(`/records/notes/${note.id}`,{description:"Synthetic amendment preserved separately from the original signed note and file."},200,"PATCH");
    assert.notEqual(amendment.id,note.id);assert.equal(amendment.status,"draft");assert.equal(amendment.metadata.priorVersionId,note.id);
    await admin.request("/actions",{action:"signNote",id:amendment.id});
    const chain=await admin.request(`/documents/${amendment.id}/versions`);assert.equal(chain.length,2);assert.ok(chain.some((v:any)=>v.recordId===note.id));assert.ok(chain.some((v:any)=>v.recordId===amendment.id&&v.sourceVersion==="2"));
    const stale=await admin.request(`/records/notes/${note.id}`,{description:"Synthetic obsolete parallel amendment."},200,"PATCH");
    await admin.request("/actions",{action:"signNote",id:stale.id},409);
    await admin.request("/actions",{action:"discardDraft",id:stale.id,reason:"x"},400);
    const discarded=await admin.request("/actions",{action:"discardDraft",id:stale.id,reason:"Synthetic obsolete parallel amendment discarded"});assert.equal(discarded.record.status,"cancelled");
    await admin.request(`/records/notes/${stale.id}`,{description:"Discarded drafts require explicit restore"},409,"PATCH");
    const restored=await admin.request("/actions",{action:"restoreDraft",id:stale.id,reason:"Synthetic restore lifecycle verification"});assert.equal(restored.record.status,"draft");
    await admin.request("/actions",{action:"discardDraft",id:stale.id,reason:"Synthetic draft verification finished"});
    await admin.request("/actions",{action:"discardDraft",id:note.id,reason:"Signed records must never be discarded"},409);
    await admin.request(`/documents/${amendment.id}/versions/${versions[0].id}`,undefined,404);
    const guard=(constraint:string)=>(e:unknown)=>!!e&&typeof e==="object"&&"code" in e&&e.code==="23514"&&"constraint" in e&&e.constraint===constraint;
    await assert.rejects(pool.query("UPDATE care_documents SET sha256=$1 WHERE id=$2",["0".repeat(64),versions[0].id]),guard("care_documents_immutable"));
    await assert.rejects(pool.query("DELETE FROM care_documents WHERE id=$1",[versions[0].id]),guard("care_documents_immutable"));
    await assert.rejects(pool.query("UPDATE care_records SET description='forged' WHERE id=$1",[note.id]),guard("care_clinical_signature_immutable"));
    await assert.rejects(pool.query("UPDATE care_records SET metadata=metadata||'{\"signedBy\":\"forged\"}'::jsonb WHERE id=$1",[note.id]),guard("care_clinical_signature_immutable"));
    await assert.rejects(pool.query("DELETE FROM care_records WHERE id=$1",[note.id]),guard("care_clinical_signature_immutable"));
    await assert.rejects(pool.query("INSERT INTO care_documents(id,record_id,patient_id,version,source_version,event_key,origin,object_path,generation,sha256,source_hash,storage_backend,pdf_bytes,source_snapshot,size,content_type,created_by,created_at) SELECT $1,record_id,patient_id,999,source_version,$2,origin,$3,generation,$4,source_hash,storage_backend,pdf_bytes,source_snapshot,size,content_type,created_by,created_at FROM care_documents WHERE id=$5",[randomUUID(),randomUUID(),randomUUID(),"0".repeat(64),versions[0].id]),guard("care_document_bytes_valid"));
    await readonly.request("/auth/login",{email:"readonly@mahalo.care",password:"MahaloDemo2026!"});
    assert.ok((await readonly.request(`/documents/${note.id}`)).bytes.equals(first.bytes));
    await patient.request("/auth/login",{email:"patient@mahalo.care",password:"MahaloDemo2026!"});
    await patient.request(`/documents/${note.id}`,undefined,403);await patient.request(`/documents/${note.id}/versions`,undefined,403);await patient.request(`/documents/${note.id}/versions/${versions[0].id}/source`,undefined,403);
    const own=(await patient.request("/patients"))[0];
    const ownDocument=(await admin.request("/records/consents")).find((r:any)=>r.patientId===own.id&&["captured","revoked"].includes(r.status));
    assert.ok(ownDocument);const ownPdf=await patient.request(`/documents/${ownDocument.id}`);assert.equal(ownPdf.headers.get("x-document-retained"),"true");
    const ownHistory=await patient.request(`/documents/${ownDocument.id}/versions`);assert.ok(ownHistory.length);await patient.request(`/documents/${ownDocument.id}/versions/${versions[0].id}`,undefined,404);
    const privateDraft=await admin.request("/records/careplans",{patientId:own.id,program:"RPM",title:`Synthetic private plan ${run}`,description:"This private draft must never be released by discarding it."},201);
    await patient.request(`/documents/${privateDraft.id}`,undefined,403);
    await admin.request("/actions",{action:"discardDraft",id:privateDraft.id,reason:"Synthetic draft privacy regression verification"});
    await patient.request(`/documents/${privateDraft.id}`,undefined,403);
    assert.ok(!(await patient.request("/records/careplans")).some((r:any)=>r.id===privateDraft.id));
    const enrolled=await admin.request("/actions",{action:"enroll",patientId,program:"RPM",payload:{consent:true,deviceSharing:true,consentMethod:"verbal"}});enrollmentId=enrolled.record.id;
    const consent=(await admin.request("/records/consents")).find((r:any)=>r.metadata.enrollmentId===enrollmentId);assert.ok(consent);assert.equal(consent.metadata.method,"verbal");
    const captured=await admin.request(`/documents/${consent.id}/versions`);assert.equal(captured.length,1);assert.equal(captured[0].origin,"consent_capture");
    await admin.request("/actions",{action:"revokeConsent",id:consent.id,reason:"Synthetic consent revocation verification"});
    const revoked=await admin.request(`/documents/${consent.id}/versions`);assert.equal(revoked.length,2);assert.equal(revoked[0].origin,"consent_revocation");assert.ok(revoked.some((v:any)=>v.sha256===captured[0].sha256));
    await assert.rejects(pool.query("UPDATE care_records SET description='forged consent' WHERE id=$1",[consent.id]),guard("care_clinical_signature_immutable"));
    assert.ok((await admin.request(`/documents/${note.id}/versions/${versions[0].id}`)).bytes.equals(first.bytes));
    await admin.request("/records/notes",{title:"Unscoped clinical note",description:"Should be rejected because a patient was not selected"},400);
    await admin.request("/records/interactions",{title:"Unscoped clinical interaction",status:"completed"},400);
  } finally {
    if(enrollmentId) await admin.request("/actions",{action:"discharge",id:enrollmentId,reason:"Synthetic document verification completed"});
    if(patientId) await admin.request(`/patients/${patientId}`,{status:"inactive"},200,"PATCH");
  }
  console.log(`PASS ${passed} document HTTP cases plus database invariants: exact signed bytes, source checksums, immutable revisions, patient authorization, consent capture and revocation.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
