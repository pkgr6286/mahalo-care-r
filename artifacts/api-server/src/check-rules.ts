import assert from "node:assert/strict";
import "./validation-fetch";
import {randomUUID} from "node:crypto";
import {pool} from "@workspace/db";
let cookie="",passed=0,patientId="",ruleId="";
const run=randomUUID().slice(0,8);
async function request(path:string,body?:unknown,expected=200,method=body===undefined?"GET":"POST") {
  const res=await fetch(`http://localhost:80/api${path}`,{method,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  if(res.headers.getSetCookie().some(c=>c.startsWith("mahalo_session="))) cookie=res.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
  const text=await res.text();assert.equal(res.status,expected,`${method} ${path}: ${text.slice(0,300)}`);
  if(!(method==="GET"&&path==="/operations/jobs")) passed++; // Polling is not counted as additional acceptance cases.
  return JSON.parse(text);
}
const action=(body:Record<string,unknown>,status=200)=>request("/actions",body,status);
async function main() {
  await request("/auth/login",{email:"demo@mahalo.care",password:"MahaloDemo2026!"});
  try {
    patientId=(await request("/patients",{firstName:"Synthetic",lastName:`Rule ${run}`,dob:"1960-01-01",location:"Garden City",conditions:["Hypertension"]},201)).id;
    await action({action:"enroll",patientId,program:"RPM",payload:{consent:true,deviceSharing:true}});
    const body={kind:"threshold",loinc:"2339-0",op:"gte",value:500,confirm_with_n_readings:2,within_hours:6,owner_role:"care_manager",escalate_after_hours:1,notify:{channels:["in_app","email"],quiet_period_minutes:60,on_call_role:"admin",critical_bypass_quiet:true},version:"synthetic-1",provisional:true};
    ruleId=(await request("/records/rules",{title:`Synthetic confirmed glucose ${run}`,program:"RPM",status:"active",severity:"high",metadata:body},201)).id;
    await request("/records/rules",{title:"Bad confirmation",program:"RPM",status:"active",metadata:{...body,confirm_with_n_readings:0}},400);
    const reading=async(n:number)=>request("/records/observations",{patientId,program:"RPM",title:`Synthetic glucose ${run}-${n}`,unit:"mg/dL",value:510+n,date:new Date(Date.now()-(10-n)*60000).toISOString(),metadata:{loinc:"2339-0",source:"clinician"}},201);
    const source=await reading(1);
    await request(`/records/observations/${source.id}`,{value:100,metadata:{source:"device",deviceCleared:true}},400,"PATCH");
    const preview=await action({action:"testRule",id:ruleId,patientId});assert.equal(preview.records[0].metadata.matched,false);
    await action({action:"evaluateRules",patientId});
    let exceptions=await request(`/records/exceptions?patientId=${patientId}`);assert.equal(exceptions.filter((r:{metadata:Record<string,unknown>})=>r.metadata.ruleId===ruleId).length,0);
    await reading(2);
    await Promise.all([action({action:"evaluateRules",patientId}),action({action:"evaluateRules",patientId})]);
    exceptions=(await request(`/records/exceptions?patientId=${patientId}`)).filter((r:{metadata:Record<string,unknown>})=>r.metadata.ruleId===ruleId);
    assert.equal(exceptions.length,1);let alert=exceptions[0];assert.equal(alert.severity,"high");assert.equal(alert.metadata.sourceIds.length,2);assert.equal(alert.metadata.ownerRole,"care_manager");
    const notifications=async()=>(await request("/records/notifications")).filter((r:{metadata:Record<string,unknown>})=>r.metadata.sourceRecordId===alert.id);
    let sent=await notifications();assert.equal(sent.length,2);assert.ok(sent.every((n:{description:string;metadata:Record<string,unknown>})=>n.description==="A patient needs attention in Mahalo Care"&&n.metadata.audience==="staff"&&n.metadata.containsClinicalContent===false));
    await reading(3);await action({action:"evaluateRules",patientId});
    alert=(await request(`/records/exceptions?patientId=${patientId}`)).find((r:{id:string})=>r.id===alert.id);
    assert.ok(alert.metadata.signalCount>=2);assert.ok(alert.metadata.notificationSuppressedCount>=1);assert.equal((await notifications()).length,2);
    const connection=await pool.connect();
    try {
      await connection.query("BEGIN");
      await assert.rejects(connection.query("INSERT INTO care_records(id,kind,title,patient_id,program,status,date,metadata) SELECT $1,kind,title,patient_id,program,status,date,metadata FROM care_records WHERE id=$2",[randomUUID(),alert.id]),/care_one_open_rule_exception/);
      await connection.query("ROLLBACK");
      await connection.query("UPDATE care_records SET created_at=now()-interval '2 hours' WHERE id=$1",[alert.id]);
    } finally {connection.release();}
    const sweep=await request("/operations/jobs",{kind:"rule_sweep"},201);
    let finished=false;
    for(let i=0;i<120;i++) {
      const jobs=await request("/operations/jobs"),job=jobs.find((j:{id:string})=>j.id===sweep.id);
      if(job?.status==="completed") {finished=true;break;}
      if(job?.status==="failed") throw new Error(`Rule sweep failed: ${job.error}`);
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    assert.ok(finished,"Escalation sweep must finish");
    alert=(await request(`/records/exceptions?patientId=${patientId}`)).find((r:{id:string})=>r.id===alert.id);
    assert.equal(alert.severity,"critical");sent=await notifications();assert.equal(sent.length,5);assert.ok(sent.some((n:{metadata:Record<string,unknown>})=>n.metadata.channel==="sms"&&n.metadata.recipientRole==="admin"));
    await action({action:"resolve",id:alert.id,reason:"Synthetic local follow-up without resolution code"},400);
    await action({action:"dismiss",id:alert.id,payload:{resolutionCode:"false_positive"}},400);
    await action({action:"acknowledge",id:alert.id});
    const note=await request("/records/notes",{patientId,program:"RPM",title:"Synthetic exception follow-up",description:"Synthetic local test only. No real medical assessment or care was performed."},201);
    await action({action:"resolve",id:alert.id,reason:"Synthetic chart linkage validation",payload:{resolutionCode:"no_action_needed",linkedNoteId:note.id}},400);
    await action({action:"signNote",id:note.id});
    const resolved=await action({action:"resolve",id:alert.id,reason:"Synthetic local alert flow was reviewed and verified",payload:{resolutionCode:"no_action_needed",linkedNoteId:note.id}});
    assert.equal(resolved.record.metadata.linkedNoteId,note.id);
    await action({action:"evaluateRules",patientId});
    assert.equal((await request(`/records/exceptions?patientId=${patientId}`)).filter((r:{status:string;metadata:Record<string,unknown>})=>r.metadata.ruleId===ruleId&&["open","acknowledged"].includes(r.status)).length,0);
    await reading(4);await action({action:"evaluateRules",patientId});
    assert.equal((await request(`/records/exceptions?patientId=${patientId}`)).filter((r:{status:string;metadata:Record<string,unknown>})=>r.metadata.ruleId===ruleId&&r.status==="open").length,1);
    const paused=await request(`/records/rules/${ruleId}`,{status:"paused"},200,"PATCH");assert.equal(paused.title,`Synthetic confirmed glucose ${run}`);
    console.log(`Passed ${passed} rule HTTP checks plus confirmation, concurrent deduplication, private notifications, cooldown, escalation, resolution and database-index assertions.`);
  } finally {
    await Promise.all([
      ruleId?request(`/records/rules/${ruleId}`,{title:`Synthetic confirmed glucose ${run}`,status:"paused"},200,"PATCH"):Promise.resolve(),
      patientId?request(`/patients/${patientId}`,{status:"inactive"},200,"PATCH"):Promise.resolve(),
    ]);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
