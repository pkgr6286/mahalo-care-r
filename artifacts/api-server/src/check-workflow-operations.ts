import assert from "node:assert/strict";
import "./validation-fetch";
import {randomUUID} from "node:crypto";
import {db,pool,users,sessions,records,programPolicies} from "@workspace/db";
import {eq,inArray} from "drizzle-orm";
import {hashPassword} from "./lib/passwords";
import {configurationHash} from "./lib/configuration";
import {refreshTimeReminders} from "./lib/time-reminders";
import {systemActor} from "./lib/device-ingestion";
const run=randomUUID().slice(0,8),userId=`workflow-${run}`;
let passed=0;
function client(){let cookie="";return {async request(path:string,body?:unknown,expected=200,method=body===undefined?"GET":"POST"){
  const r=await fetch("http://localhost:80/api"+path,{method,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  if(r.headers.getSetCookie().some(c=>c.startsWith("mahalo_session=")))cookie=r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
  const text=await r.text();assert.equal(r.status,expected,`${method} ${path}: ${text.slice(0,200)}`);passed++;return JSON.parse(text);
}};}
const admin=client(),patient=client(),owner=client(),other=client();
async function main(){
  const referenceIds:string[]=[],policyIds:string[]=[];let pid="",enrollment="",timer="";
  await admin.request("/auth/login",{email:"demo@mahalo.care",password:"MahaloDemo2026!"});
  await patient.request("/auth/login",{email:"patient@mahalo.care",password:"MahaloDemo2026!"});
  await other.request("/auth/login",{email:"caremanager@mahalo.care",password:"MahaloDemo2026!"});
  await db.insert(users).values({id:userId,email:`${userId}@example.test`,name:`Synthetic workflow ${run}`,role:"care_manager",credential:"RN",locationScopes:["Garden City"],passwordHash:await hashPassword("WorkflowVerify2026!")});
  try{
    await owner.request("/auth/login",{email:`${userId}@example.test`,password:"WorkflowVerify2026!"});
    const own=(await patient.request("/patients"))[0],enrollments=await patient.request("/records/enrollments"),program=enrollments.find((r:any)=>r.status==="active")?.program;assert.ok(program);
    const material=await admin.request("/records/education",{title:`Synthetic reading ${run}`,description:"Synthetic learning example",program,metadata:{body:"Initial displayed synthetic text",contentVersion:"1",sourceRef:"Self-authored synthetic test",nonClinical:true}},201);referenceIds.push(material.id);
    const current=(await patient.request("/records/education")).find((r:any)=>r.id===material.id);assert.ok(current.metadata.contentHash);
    await patient.request("/actions",{action:"acknowledgeEducation",id:material.id,patientId:own.id,program,payload:{contentHash:current.metadata.contentHash}},400);
    await patient.request("/actions",{action:"acknowledgeEducation",id:material.id,patientId:own.id,program,payload:{acknowledged:true,contentHash:"outdated"}},409);
    const action={action:"acknowledgeEducation",id:material.id,patientId:own.id,program,payload:{acknowledged:true,contentHash:current.metadata.contentHash}};
    const ack=(await patient.request("/actions",action)).record;assert.equal(ack.metadata.method,"patient_self_attestation");assert.equal(ack.metadata.contentSnapshot.body,"Initial displayed synthetic text");
    assert.equal((await patient.request("/actions",action)).record.id,ack.id);
    await patient.request("/actions",{...action,patientId:"not-own-patient"},403);
    await admin.request(`/records/education/${material.id}`,{metadata:{body:"Revised synthetic text",contentVersion:"2"}},200,"PATCH");
    await patient.request("/actions",action,409);
    const revised=(await patient.request("/records/education")).find((r:any)=>r.id===material.id);
    const ack2=(await patient.request("/actions",{...action,payload:{acknowledged:true,contentHash:revised.metadata.contentHash}})).record;assert.notEqual(ack.id,ack2.id);
    const ownTasks=await patient.request("/records/tasks");assert.equal(ownTasks.find((r:any)=>r.id===ack.id).metadata.contentSnapshot.body,"Initial displayed synthetic text");
    await assert.rejects(pool.query("UPDATE care_records SET description='forged' WHERE id=$1",[ack.id]),(e:any)=>e.code==="23514");
    await admin.request("/records/tasks",{title:"Forged acknowledgment",patientId:own.id,metadata:{kind:"education_acknowledgment"}},400);
    const clinical=await admin.request("/records/education",{title:`Synthetic reviewed learning ${run}`,status:"draft",program,
      metadata:{body:"Original synthetic clinical-learning fixture, not medical advice.",contentVersion:"1",sourceRef:"Self-authored test",
        licenseNote:"Original synthetic wording, permitted only for local verification."}},201);referenceIds.push(clinical.id);
    assert.ok(!(await patient.request("/records/education")).some((r:any)=>r.id===clinical.id));
    await admin.request(`/records/education/${clinical.id}`,{status:"active"},400,"PATCH");
    const released=await admin.request(`/records/education/${clinical.id}`,{status:"active",metadata:{contentApprovedForUse:true,contentReviewedById:"forged"}},200,"PATCH");
    assert.equal(released.metadata.contentReviewedById,"demo-admin");
    const readable=(await patient.request("/records/education")).find((r:any)=>r.id===clinical.id);assert.ok(readable.metadata.contentHash);
    await admin.request(`/records/education/${clinical.id}`,{metadata:{body:"Changed synthetic wording"}},400,"PATCH");
    assert.equal((await admin.request(`/records/education/${clinical.id}`)).metadata.body,clinical.metadata.body,"Failed active edits must not alter the released text");
    const withdrawn=await admin.request(`/records/education/${clinical.id}`,{status:"draft",metadata:{body:"Changed synthetic wording",contentVersion:"2"}},200,"PATCH");
    assert.equal(withdrawn.metadata.contentApprovedForUse,false);assert.equal(withdrawn.metadata.contentReviewHash,null);
    assert.ok(!(await patient.request("/records/education")).some((r:any)=>r.id===clinical.id));
    await patient.request("/actions",{action:"acknowledgeEducation",id:clinical.id,patientId:own.id,program,payload:{acknowledged:true,contentHash:readable.metadata.contentHash}},409);
    await admin.request(`/records/education/${clinical.id}`,{status:"active",metadata:{contentApprovedForUse:true}},200,"PATCH");
    for(const url of ["http://example.test/guide","https://user:pass@example.test/guide"])await admin.request(`/records/education/${clinical.id}`,{metadata:{url}},400,"PATCH");
    const instrument=await admin.request("/records/instruments",{title:`Synthetic custom wording ${run}`,status:"active",metadata:{key:"pain_nrs",questions:["Synthetic question only"],contentVersion:"1"}},201);referenceIds.push(instrument.id);
    assert.ok(!(await patient.request("/records/instruments")).some((r:any)=>r.id===instrument.id),"Unreviewed wording must not be disclosed to the patient API");
    const checkin={action:"submitCheckin",patientId:own.id,program,payload:{instrument:"pain_nrs",instrumentId:instrument.id,answers:[2]}};
    await patient.request("/actions",checkin,409);
    const approved=await admin.request(`/records/instruments/${instrument.id}`,{metadata:{contentApprovedForUse:true,contentReviewedById:"forged",sourceRef:"Self-authored synthetic wording",licenseNote:"Self-authored question approved only for this synthetic workflow verification."}},200,"PATCH");
    assert.equal(approved.metadata.contentReviewedById,"demo-admin");assert.ok(approved.metadata.contentReviewHash);
    assert.ok((await patient.request("/records/instruments")).some((r:any)=>r.id===instrument.id));
    const response=(await patient.request("/actions",checkin)).record;assert.equal(response.metadata.instrumentSnapshot.questions[0],"Synthetic question only");assert.equal(response.metadata.band,"unclassified");
    await admin.request(`/records/instruments/${instrument.id}`,{metadata:{questions:["Changed synthetic question"],contentVersion:"2"}},200,"PATCH");
    await patient.request("/actions",checkin,409);
    await other.request(`/records/instruments/${instrument.id}`,{metadata:{contentApprovedForUse:true}},403,"PATCH");
    const backup=await admin.request("/exports/configuration");assert.equal(backup.version,2);assert.ok(backup.policies.length>=5);
    await other.request("/exports/configuration",undefined,403);
    await admin.request("/actions",{action:"importConfiguration",payload:{...backup,sha256:"0".repeat(64)}},400);
    const base=backup.policies.find((p:any)=>p.id.startsWith("bundled:RPM:")),code=base.body.codes.find((c:any)=>c.kind!=="addon"&&c.requires.minutes_min>0);
    const body={version:2,format:"mahalo-care-configuration",dataClass:"synthetic",exportedAt:new Date().toISOString(),records:[{kind:"education",title:`Imported example ${run}`,metadata:{contentApprovedForUse:true,reviewedById:"foreign"}}],policies:[{id:`foreign-${run}`,kind:"payer_override",program:"RPM",payer:`Synthetic payer ${run}`,version:`qa-${run}`,effectiveFrom:base.effectiveFrom,sourceRef:"Synthetic foreign source",sourceStatus:"published",body:{basePolicyId:base.id,codes:[{cpt:code.cpt,minutes_min:code.requires.minutes_min+5}]}},base]};
    const before=(await db.select().from(programPolicies)).length;
    const imported=await admin.request("/actions",{action:"importConfiguration",payload:{...body,sha256:configurationHash(body)}});
    for(const r of imported.records){referenceIds.push(r.id);assert.equal(r.status,"draft");assert.equal(r.metadata.contentApprovedForUse,false);assert.equal(r.metadata.reviewedById,undefined);}
    const newPolicies=(await db.select().from(programPolicies)).filter(r=>r.sourceRef.includes(configurationHash(body)));assert.equal(newPolicies.length,2);
    policyIds.push(...newPolicies.map(r=>r.id));assert.ok(newPolicies.every(r=>r.status==="draft"&&r.reviewedBy===null));
    const payer=newPolicies.find(r=>r.kind==="payer_override")!,newBase=newPolicies.find(r=>r.kind==="rulepack")!;assert.equal(payer.body.basePolicyId,newBase.id);
    await admin.request(`/policies/${payer.id}/review`,{note:"Synthetic local review must wait for its base to be published.",sourceRef:"Self-authored synthetic test",attested:true},409);
    assert.equal((await db.select().from(programPolicies)).length,before+2);
    const invalid={...body,records:[{kind:"notes",title:"Forbidden patient content"}]};await admin.request("/actions",{action:"importConfiguration",payload:{...invalid,sha256:configurationHash(invalid)}},400);
    assert.equal((await db.select().from(programPolicies)).length,before+2);
    pid=(await admin.request("/patients",{firstName:"Synthetic",lastName:`Timer ${run}`,dob:"1960-01-01",location:"Garden City",conditions:["Hypertension"]},201)).id;
    enrollment=(await admin.request("/actions",{action:"enroll",patientId:pid,program:"RPM",payload:{consent:true,deviceSharing:true}})).record.id;
    timer=(await owner.request("/actions",{action:"startTimer",patientId:pid,program:"RPM"})).record.id;
    // Test only this fixture, using a controlled future clock without changing clinical timestamps.
    const result=await db.transaction(s=>refreshTimeReminders(s,systemActor,Date.now()+16*60000,timer));assert.equal(result.created,1);
    assert.equal((await db.transaction(s=>refreshTimeReminders(s,systemActor,Date.now()+16*60000,timer))).created,0);
    const task=(await owner.request("/records/tasks")).find((r:any)=>r.metadata.timeEntryId===timer);assert.equal(task.metadata.ownerUserId,userId);assert.equal(task.metadata.audience,"staff");
    await owner.request("/actions",{action:"completeTask",id:task.id},409);
    await other.request("/actions",{action:"voidTime",id:timer,reason:"Attempting to void another clinician's timer"},403);
    await owner.request("/actions",{action:"discardTimer",id:timer,reason:"Synthetic timer reminder verification only"});
    assert.equal((await owner.request(`/records/tasks/${task.id}`)).status,"completed");
    await db.update(users).set({locationScopes:["synthetic-workflow-location"]}).where(eq(users.id,userId));
    const scopedClose=await owner.request("/actions",{action:"closePeriod"},403);
    assert.match(scopedClose.error,/practice-wide/i);
    await owner.request("/actions",{action:"reopenPeriod",reason:"Synthetic scope check only"},403);
  }finally{
    if(timer){const t=(await db.select().from(records).where(eq(records.id,timer)))[0];if(t?.status==="running")await owner.request("/actions",{action:"discardTimer",id:timer,reason:"Clean up synthetic workflow timer"});}
    if(enrollment)await admin.request("/actions",{action:"discharge",id:enrollment,reason:"Synthetic workflow verification completed"});
    if(pid)await admin.request(`/patients/${pid}`,{status:"inactive"},200,"PATCH");
    for(const id of referenceIds)await admin.request(`/records/${(await db.select().from(records).where(eq(records.id,id)))[0]!.kind}/${id}`,{status:"inactive"},200,"PATCH");
    if(policyIds.length)await db.delete(programPolicies).where(inArray(programPolicies.id,policyIds));
    await db.update(users).set({status:"inactive"}).where(eq(users.id,userId));await db.delete(sessions).where(eq(sessions.userId,userId));
  }
  console.log(`PASS ${passed} workflow HTTP cases plus immutable acknowledgments and transactional draft-policy checks.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
