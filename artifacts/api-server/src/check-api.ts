import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { GetDashboardResponse, GetPatientResponse, ListRecordsResponse, PerformActionResponse, CreatePatientResponse, UpdateRecordResponse } from "@workspace/api-zod";

// Real API/database integration checks against synthetic development data only.
const base="http://localhost:80/api";
let cookie="",passed=0;
async function request(path:string,body?:unknown,expected=200,method?:string,counted=true) {
  const res=await fetch(base+path,{method:method||(body?"POST":"GET"),headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  assert.equal(res.status,expected,`${path}${body&&typeof body==="object"&&"action" in body?` (${body.action})`:""}: ${await res.clone().text()}`);
  if(path==="/auth/login"&&res.ok) cookie=res.headers.get("set-cookie")!.split(";")[0]!;
  const type=res.headers.get("content-type")||"";
  if(counted) passed++;
  return type.includes("json")?await res.json():await res.arrayBuffer();
}
async function action(body:Record<string,unknown>,expected=200) {
  const result=await request("/actions",body,expected);
  return PerformActionResponse.parse(expected===200?result:{success:false,message:"Expected rejection"});
}
async function run() {
  await request("/dashboard",undefined,401);
  await request("/auth/login",{email:"demo@mahalo.care",password:"wrong"},401);
  await request("/auth/login",{email:"demo@mahalo.care",password:"MahaloDemo2026!"});
  const existing=ListRecordsResponse.parse(await request("/records/billing"));
  if(existing.some(r=>r.metadata?.period===new Date().toISOString().slice(0,7)&&r.metadata.closed)) await action({action:"reopenPeriod",reason:"Prepare local automated synthetic rehearsal"});
  GetDashboardResponse.parse(await request("/dashboard"));
  const patient=CreatePatientResponse.parse(await request("/patients",{firstName:"Workflow",lastName:`Check ${Date.now()}`,dob:"1965-01-15",location:"Garden City",conditions:["Hypertension","Diabetes"]},201));
  const pid=patient.id;
  try {
    await action({action:"enroll",patientId:pid,program:"RPM",payload:{consent:false}},400);
    await action({action:"enroll",patientId:pid,program:"RPM",payload:{consent:true,deviceSharing:true}});
    await action({action:"enroll",patientId:pid,program:"RTM",payload:{consent:true}},409);
    await action({action:"enroll",patientId:pid,program:"RPM",payload:{consent:true}},409);
    let chart=GetPatientResponse.parse(await request(`/patients/${pid}`));
    const plan=chart.records.find(r=>r.kind==="careplans")!;
    await action({action:"signPlan",id:plan.id},400);
    const planFields={schemaVersion:2,problems:["Hypertension","Diabetes"],medications:[],reconciledAt:new Date().toISOString().slice(0,10),expectedOutcome:"Support sustained self-management with coordinated daily monitoring and monthly review.",careTeam:["Synthetic care team"],reviewDays:30,monitoredParameters:"Blood pressure",readingSchedule:"Daily",escalationContact:"Synthetic care team"};
    await request("/records/devices",{title:"Workflow RPM monitor",patientId:pid,program:"RPM",status:"assigned",metadata:{serial:`WORKFLOW-${Date.now()}`,setupCompleted:true}},201);
    await request(`/records/careplans/${plan.id}`,{title:"Validated test care plan",description:"Synthetic care-plan narrative for an automated workflow check.",status:"draft",metadata:{...planFields,goals:"Maintain stable home monitoring",interventions:"Daily readings and care-team review"}},200,"PATCH");
    await action({action:"signPlan",id:plan.id});
    await action({action:"signPlan",id:plan.id},409);
    const pdf=await request(`/documents/${plan.id}`);
    assert.ok(pdf instanceof ArrayBuffer);
    assert.equal(Buffer.from(pdf).subarray(0,4).toString(),"%PDF");
    const revision=UpdateRecordResponse.parse(await request(`/records/careplans/${plan.id}`,{title:"Revised test care plan",description:"New version requiring a new signature.",status:"draft",metadata:{goals:"Updated goal",interventions:"Updated intervention"}},200,"PATCH"));
    assert.notEqual(revision.id,plan.id);
    chart=GetPatientResponse.parse(await request(`/patients/${pid}`));
    assert.equal(chart.records.find(r=>r.id===plan.id)?.status,"active","Prior plan must remain active while revision is draft");
    await action({action:"signPlan",id:revision.id});
    const generated=await action({action:"generateTasks",patientId:pid});
    assert.equal(generated.records?.length,0,"Task materialization must be idempotent");
    await action({action:"reviewPlan",id:revision.id,payload:{summary:"Synthetic review confirmed care-plan goals and assigned responsibilities."}});
    await action({action:"reviewPlan",id:revision.id,payload:{summary:""}},400);
    await action({action:"startTimer",patientId:pid,program:"RPM"});
    await action({action:"startTimer",patientId:pid,program:"RPM"},409);
    chart=GetPatientResponse.parse(await request(`/patients/${pid}`));
    const timer=chart.records.find(r=>r.kind==="time"&&r.status==="running")!;
    await action({action:"discardTimer",id:timer.id},400);
    await action({action:"discardTimer",id:timer.id,reason:"Synthetic timer discard verification"});
    const read=await action({action:"simulateReading",patientId:pid,program:"RPM",payload:{systolic:185,diastolic:121}});
    assert.equal(read.record!.metadata!.valid,true);
    await action({action:"simulateReading",patientId:pid,program:"RPM",payload:{systolic:188,diastolic:122}});
    chart=GetPatientResponse.parse(await request(`/patients/${pid}`));
    // Reading capture commits before its durable rule job runs. Poll this same case, rather
    // than assuming the former hardcoded synchronous BP shortcut still owns alert creation.
    for(let i=0;i<80&&!chart.records.some(r=>r.kind==="exceptions"&&r.status==="open"&&r.metadata?.ruleKey==="bp_critical");i++) {
      await new Promise(resolve=>setTimeout(resolve,250));
      chart=GetPatientResponse.parse(await request(`/patients/${pid}`,undefined,200,undefined,false));
    }
    const critical=chart.records.filter(r=>r.kind==="exceptions"&&r.status==="open"&&r.metadata?.ruleKey==="bp_critical");
    assert.equal(critical.length,1,"Critical exceptions should be deduplicated");
    await action({action:"resolve",id:critical[0]!.id},400);
    await action({action:"acknowledge",id:critical[0]!.id});
    await action({action:"resolve",id:critical[0]!.id,reason:"Automated synthetic workflow verified",payload:{resolutionCode:"no_action_needed"}});
    await action({action:"submitCheckin",patientId:pid,program:"RPM",payload:{instrument:"phq9",answers:[0,0,0]}},400);
    await action({action:"submitCheckin",patientId:pid,program:"RPM",payload:{instrument:"pain_nrs",answers:[4]}});
    const slot=new Date(Date.now()-86400000*2-1000*(Date.now()%10000));
    const start=slot.toISOString(),end=new Date(slot.getTime()+60000).toISOString();
    await action({action:"commitTime",patientId:pid,program:"RPM",payload:{startedAt:start,endedAt:end,activity:"review_data"}});
    await action({action:"commitTime",patientId:pid,program:"RPM",payload:{startedAt:start,endedAt:end,activity:"review_data"}},409);
    const first=await action({action:"recordAdherence",patientId:pid,program:"RPM",payload:{kind:"medication",title:"Synthetic scheduled medication",status:"done"}});
    const repeat=await action({action:"recordAdherence",patientId:pid,program:"RPM",payload:{kind:"medication",title:"Synthetic scheduled medication",status:"done"}});
    assert.equal(first.record!.id,repeat.record!.id,"Daily adherence must be idempotent");
    const draft=await action({action:"draftSummary",patientId:pid});
    await action({action:"acceptDraft",id:draft.record!.id,payload:{reviewConfirmed:true}});
    await action({action:"acceptDraft",id:draft.record!.id},409);
    ListRecordsResponse.parse(await request("/records/audit"));
    await request("/records/audit",{title:"Tamper"},400);
    await request("/exports/configuration");
    await request("/exports/patients");
    const spreadsheet=await request("/exports/billing?format=xlsx");
    assert.ok(spreadsheet instanceof ArrayBuffer);
    assert.equal(Buffer.from(spreadsheet).subarray(0,2).toString(),"PK");
    await action({action:"testRule",id:(await request("/records/rules") as {id:string}[])[0]!.id,patientId:pid});
    const csv="firstName,lastName,dob,location\nSynthetic,ImportCheck,1962-05-10,Garden City";
    const validation=await action({action:"importPatients",payload:{csv,dryRun:true,syntheticConfirmed:true}});
    assert.equal(validation.record!.metadata!.newRows,1);
    await action({action:"importPatients",payload:{csv,dryRun:true,syntheticConfirmed:false}},400);
    await action({action:"calculateBilling"});
    const evidence=ListRecordsResponse.parse(await request("/records/billing"));
    const ownCandidate=evidence.find(r=>r.patientId===pid&&r.status==="candidate"&&r.metadata?.met===true);
    assert.ok(ownCandidate,"Setup evidence should qualify for the synthetic assigned device");
    await action({action:"bulkApproveLines",payload:{ids:[ownCandidate!.id]}},409);
    const closed=await action({action:"closePeriod"});
    await action({action:"bulkApproveLines",payload:{ids:[ownCandidate!.id]}});
    await action({action:"bulkApproveLines",payload:{ids:[ownCandidate!.id]}},400);
    const count=closed.records?.length;
    const second=await action({action:"closePeriod"});
    assert.equal(second.records?.length,count);
    await action({action:"calculateBilling"},409);
    await action({action:"reopenPeriod",reason:"Synthetic release-check rehearsal"});
    const connection=await pool.connect();
    try {
      await connection.query("BEGIN");
      await assert.rejects(connection.query("UPDATE care_audit SET action='tampered' WHERE id=(SELECT id FROM care_audit LIMIT 1)"),/append-only/);
      await connection.query("ROLLBACK");
      passed++;
      await connection.query("BEGIN");
      await assert.rejects(connection.query("INSERT INTO care_records(id,kind,patient_id,program,title,status,date,value,unit,metadata) SELECT $1,kind,patient_id,program,title,status,date,value,unit,metadata FROM care_records WHERE kind='time' AND status='committed' LIMIT 1",[`overlap-${Date.now()}`]),/overlaps/);
      await connection.query("ROLLBACK");passed++;
      await connection.query("BEGIN");
      const meta=JSON.stringify({startedAt:new Date().toISOString(),userId:`db-guard-${pid}`});
      await connection.query("INSERT INTO care_records(id,kind,patient_id,title,status,date,metadata) VALUES($1,'time',$2,'Synthetic DB timer','running',$3,$4)",[`timer-a-${pid}`,pid,new Date().toISOString(),meta]);
      await assert.rejects(connection.query("INSERT INTO care_records(id,kind,patient_id,title,status,date,metadata) VALUES($1,'time',$2,'Synthetic DB timer','running',$3,$4)",[`timer-b-${pid}`,pid,new Date().toISOString(),meta]),/one running timer/);
      await connection.query("ROLLBACK");passed++;
    } finally {connection.release();}
    await request("/auth/logout",{});
    await request("/auth/me",undefined,401);
    await request("/auth/login",{email:"patient@mahalo.care",password:"MahaloDemo2026!"});
    const me=await request("/auth/me") as {patientId:string};
    const own=await request("/patients") as {id:string}[];
    assert.equal(own.length,1);
    assert.equal(own[0]!.id,me.patientId);
    await request("/dashboard",undefined,403);
    await request(`/patients/${pid}`,undefined,403);
    await request("/records/audit",undefined,403);
    await request("/exports/patients",undefined,403);
    await action({action:"calculateBilling"},403);
    await action({action:"recordAdherence",patientId:pid,payload:{kind:"medication",title:"wrong patient"}},403);
    await request("/records/messages",{title:"Scope check",patientId:pid,description:"Must not be sent"},403);
    await request("/auth/logout",{});
  } finally {
    await pool.query("UPDATE care_patients SET status='inactive' WHERE id=$1",[pid]);
  }
  process.stdout.write(JSON.stringify({passed,status:"passed",scope:"Real HTTP APIs, PostgreSQL persistence and audit protection; not browser E2E",sourceHash:createHash("sha256").update("mahalo-api-check-v1").digest("hex")})+"\n");
}
run().catch(error=>{process.stderr.write(String(error)+"\n");process.exitCode=1;}).finally(()=>pool.end());
