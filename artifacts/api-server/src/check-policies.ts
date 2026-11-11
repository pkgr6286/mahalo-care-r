import assert from "node:assert/strict";
import "./validation-fetch";
import {randomUUID} from "node:crypto";
import {pool} from "@workspace/db";

const run=randomUUID().slice(0,8),version=`rehearsal-${run}`,createdPolicies:string[]=[],createdPatients:string[]=[];
let count=0,accountId="";
class Client {
  cookie="";
  async request(path:string,body?:unknown,expected=200,method=body===undefined?"GET":"POST") {
    const response=await fetch(`http://localhost:80/api${path}`,{method,headers:{"Content-Type":"application/json",...(this.cookie?{Cookie:this.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    if(response.headers.getSetCookie().some(c=>c.startsWith("mahalo_session="))) this.cookie=response.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
    const text=await response.text();assert.equal(response.status,expected,`${method} ${path}: ${text.slice(0,350)}`);count++;
    return response.headers.get("content-type")?.includes("json")?JSON.parse(text):text;
  }
}
const admin=new Client();
const path=(id:string,suffix="")=>`/policies/${encodeURIComponent(id)}${suffix}`;
const envelope=(row:Record<string,unknown>)=>({kind:row.kind,program:row.program,version:row.version,payer:row.payer??"",effectiveFrom:row.effectiveFrom,sourceRef:row.sourceRef??"",body:row.body});
async function publish(row:{id:string}) {
  await admin.request(path(row.id,"/review"),{note:"Reviewed solely for a synthetic local policy rehearsal.",sourceRef:"Supplied specification / VERIFY / local automated rehearsal",attested:true});
  return admin.request(path(row.id,"/publish"),{reason:"Publish this synthetic policy rehearsal version"});
}
async function create(kind:string,body:Record<string,unknown>,payer="") {
  const row=await admin.request("/policies",{kind,program:"RPM",version,payer,effectiveFrom:"2026-01-01",sourceRef:"Synthetic verification fixture",body},201);
  createdPolicies.push(row.id);return row;
}
async function main() {
  await admin.request("/auth/login",{email:"demo@mahalo.care",password:"MahaloDemo2026!"});
  try {
    const lines=await admin.request("/records/billing");
    if(lines.some((r:{metadata:Record<string,unknown>})=>r.metadata.period===new Date().toISOString().slice(0,7)&&r.metadata.closed)) await admin.request("/actions",{action:"reopenPeriod",reason:"Prepare local synthetic policy rehearsal"});
    const policies=await admin.request("/policies");
    const baseline=policies.items.find((p:{kind:string;program:string;status:string})=>p.kind==="rulepack"&&p.program==="RPM"&&p.status==="bundled");
    assert.ok(baseline?.immutable);
    const draft=await admin.request(path(baseline.id,"/clone"),{version,effectiveFrom:"2026-01-01"},201);createdPolicies.push(draft.id);
    assert.equal(draft.status,"draft");assert.equal(draft.body.version,version);
    const preview=await admin.request("/policies/validate",envelope(draft));assert.equal(preview.valid,true);assert.ok(preview.evidence.some((c:{cpt:string})=>c.cpt==="99457"));
    await admin.request(path(draft.id,"/publish"),{reason:"Attempt without prior policy review"},409);
    await admin.request(path(draft.id,"/review"),{note:"Missing attestation must not be accepted",sourceRef:"Synthetic"},400);
    await admin.request(path(draft.id,"/review"),{note:"Reviewed solely for a synthetic local policy rehearsal.",sourceRef:"Supplied specification / VERIFY / local automated rehearsal",attested:true});
    await admin.request(path(draft.id),envelope(draft),409,"PATCH");
    const base=await admin.request(path(draft.id,"/publish"),{reason:"Synthetic local source-binding rehearsal"});
    assert.equal(base.status,"published");assert.ok(base.fingerprint);
    const payer=`Synthetic payer ${run}`;
    await admin.request("/policies/validate",{kind:"payer_override",program:"RPM",version,payer,effectiveFrom:"2026-01-01",body:{basePolicyId:base.id,codes:[{cpt:"99457",minutes_min:10}]}},400);
    const override=await publish(await create("payer_override",{basePolicyId:base.id,codes:[{cpt:"99457",minutes_min:30}]},payer));
    const template=await publish(await create("careplan_template",{
      key:"rpm_default",description:"Synthetic monitoring plan prepared for local verification and clinician review.",
      sections:{goals:["Review blood pressure with the care team"],interventions:["Review readings and provide education"],careTeam:"Synthetic assigned clinical team",reviewDays:30,expectedOutcome:"Maintain a documented monitoring plan with patient education and timely clinical review.",monitoredParameters:["Blood pressure"],readingSchedule:"Daily morning readings",escalationContact:"Synthetic practice clinical line",reconciledAt:new Date().toISOString().slice(0,10)},items:[],
    }));
    const noteTemplate=await publish(await create("note_template",{key:"rpm_followup",title:"Monitoring follow-up",sections:[{key:"assessment",label:"Assessment",required:true},{key:"plan",label:"Plan",required:true}]}));
    const p=await admin.request("/patients",{firstName:"Synthetic",lastName:`Policy ${run}`,dob:"1960-01-01",location:"Garden City",conditions:["Hypertension"],payer},201);createdPatients.push(p.id);
    await admin.request("/actions",{action:"enroll",patientId:p.id,program:"RPM",payload:{consent:true,rulepackId:baseline.id,deviceSharing:true}},409);
    await admin.request("/actions",{action:"enroll",patientId:p.id,program:"RPM",payload:{consent:true,rulepackId:base.id}},400);
    const enrolled=await admin.request("/actions",{action:"enroll",patientId:p.id,program:"RPM",payload:{consent:true,rulepackId:base.id,deviceSharing:true}});
    assert.equal(enrolled.record.metadata.rulepackId,base.id);
    const chart=await admin.request(`/patients/${p.id}`);
    const plan=chart.records.find((r:{kind:string})=>r.kind==="careplans");assert.equal(plan.metadata.templateId,template.id);assert.equal(plan.metadata.templateVersion,version);
    assert.ok(chart.records.find((r:{kind:string})=>r.kind==="consents").metadata.consentTypes.includes("device_sharing"));
    await admin.request("/records/devices",{title:"Synthetic policy cuff",patientId:p.id,program:"RPM",status:"assigned",metadata:{serial:`POLICY-${run}`,fdaCleared:true,setupCompleted:true}},201);
    await admin.request("/actions",{action:"signPlan",id:plan.id});
    const emptyNote=await admin.request("/records/notes",{title:"Synthetic structured note",patientId:p.id,program:"RPM",status:"draft",metadata:{templateId:noteTemplate.id,sectionValues:{assessment:"",plan:""}}},201);
    await admin.request("/actions",{action:"signNote",id:emptyNote.id},400);
    const note=await admin.request(`/records/notes/${emptyNote.id}`,{title:emptyNote.title,program:"RPM",metadata:{sectionValues:{assessment:"Synthetic data reviewed with no real clinical conclusion.",plan:"Continue the synthetic demonstration monitoring schedule."}}},200,"PATCH");
    const signed=await admin.request("/actions",{action:"signNote",id:note.id});assert.equal(signed.record.status,"signed");
    const addendum=await admin.request(`/records/notes/${note.id}`,{title:"Synthetic note addendum",metadata:{sectionValues:{assessment:"Additional synthetic context was reviewed.",plan:"No real patient care or treatment was provided."}}},200,"PATCH");
    assert.notEqual(addendum.id,note.id);assert.equal(addendum.metadata.priorVersionId,note.id);
    const evidence=await admin.request("/actions",{action:"calculateBilling"});
    const candidate=evidence.records.find((r:{patientId:string;metadata:Record<string,unknown>})=>r.patientId===p.id&&r.metadata.cpt==="99457");
    assert.equal(candidate.metadata.rulepackId,base.id);assert.equal(candidate.metadata.payerPolicyId,override.id);assert.equal(candidate.metadata.requirements.minutes_min,30);
    assert.match(candidate.metadata.rulepackHash,/^[a-f0-9]{64}$/);
    assert.equal((await admin.request(path(base.id))).enrollmentCount,1);
    const connection=await pool.connect();
    try {
      await connection.query("BEGIN");
      await assert.rejects(connection.query("UPDATE care_program_policies SET body='{}'::jsonb WHERE id=$1",[base.id]),/immutable/);
      await connection.query("ROLLBACK");
      await connection.query("BEGIN");
      await assert.rejects(connection.query("DELETE FROM care_program_policies WHERE id=$1",[base.id]),/cannot be deleted/);
      await connection.query("ROLLBACK");
    } finally {connection.release();}
    const readonly=new Client(),email=`policy-reader-${run}@example.test`,password="SyntheticPolicy2026!";
    const invitation=await admin.request("/accounts",{name:`Synthetic policy reader ${run}`,email,role:"read_only",credential:"RN",locationScopes:[]},201);accountId=invitation.account.id;
    const token=new URL(invitation.path,"https://example.test").searchParams.get("token");
    await readonly.request("/auth/password/reset",{token,password});
    await readonly.request("/auth/login",{email,password});
    await readonly.request("/policies");
    await readonly.request("/policies",envelope(draft),403);
    await readonly.request(path(base.id,"/review"),{note:"Unauthorized review must not be permitted",sourceRef:"Synthetic",attested:true},403);
    const patient=new Client();await patient.request("/auth/login",{email:"patient@mahalo.care",password:"MahaloDemo2026!"});
    await patient.request("/policies",undefined,403);
    for(const policy of [base,override,template,noteTemplate]) await admin.request(path(policy.id,"/retire"),{reason:"End the synthetic policy rehearsal and preserve its history"});
    const recalculated=await admin.request("/actions",{action:"calculateBilling"});
    const retained=recalculated.records.find((r:{patientId:string;metadata:Record<string,unknown>})=>r.patientId===p.id&&r.metadata.cpt==="99457");
    assert.equal(retained.metadata.rulepackId,base.id);assert.equal(retained.metadata.payerPolicyId,override.id);assert.equal(retained.metadata.requirements.minutes_min,30);
    assert.equal(retained.metadata.rulepackHash,candidate.metadata.rulepackHash);
    await admin.request("/actions",{action:"signNote",id:addendum.id});
    await admin.request("/records/notes",{title:"Must not use retired template",patientId:p.id,program:"RPM",metadata:{templateId:noteTemplate.id,sectionValues:{assessment:"Synthetic",plan:"Synthetic"}}},400);
    console.log(`Passed ${count} policy/template HTTP checks plus pinned-history, source-hash and database-immutability assertions.`);
  } finally {
    for(const pid of createdPatients) await admin.request(`/patients/${pid}`,{status:"inactive"},200,"PATCH");
    if(accountId) await admin.request(`/accounts/${accountId}`,{status:"inactive"},200,"PATCH");
    const policies=await admin.request("/policies");
    for(const policy of policies.items.filter((p:{id:string;status:string})=>createdPolicies.includes(p.id)&&p.status==="published")) await admin.request(path(policy.id,"/retire"),{reason:"Clean up interrupted synthetic policy rehearsal"});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
