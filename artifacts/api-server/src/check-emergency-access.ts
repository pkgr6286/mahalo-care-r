import "./validation-fetch";
import assert from "node:assert/strict";
import {pool} from "@workspace/db";
import {digest} from "./lib/account-security";

let passed=0;
class Client{
  cookie="";
  async request(path:string,body?:unknown,status=200,method?:string):Promise<any>{
    const r=await fetch(`http://localhost:80/api${path}`,{method:method??(body?"POST":"GET"),headers:{"Content-Type":"application/json",...(this.cookie?{Cookie:this.cookie}:{})},body:body?JSON.stringify(body):undefined});
    assert.equal(r.status,status,`${path}: ${await r.clone().text()}`);passed++;
    if(path==="/auth/login"&&r.ok)this.cookie=r.headers.get("set-cookie")!.split(";")[0]!;
    return r.json();
  }
}
async function run(){
  const root=new Client(),nurse=new Client(),otherSession=new Client(),suffix=Date.now();
  await root.request("/auth/login",{email:"demo@mahalo.care",password:"MahaloDemo2026!"});
  const invite=await root.request("/accounts",{name:`Emergency access verification ${suffix}`,email:`emergency-${suffix}@example.test`,role:"care_manager",credential:"RN",locationScopes:["Garden City"]},201);
  const credentials={email:invite.account.email,password:"EmergencyVerification2026!"};
  await nurse.request("/auth/password/reset",{token:new URL(invite.path,"http://localhost").searchParams.get("token"),password:credentials.password});
  assert.equal((await nurse.request("/auth/login",credentials)).canUseEmergencyAccess,true);
  await otherSession.request("/auth/login",credentials);
  const make=(name:string,location:string)=>root.request("/patients",{firstName:"Emergency",lastName:`${name} verification ${suffix}`,dob:"1952-04-12",location},201);
  const own=await make("own-site","Garden City"),target=await make("target","Huntington"),other=await make("same-site other","Huntington");
  const reason="Covering clinical staff requested urgent chart review for this fictional local verification.";
  const input={mrn:target.mrn,reason,attested:true};
  await nurse.request("/auth/emergency-access",{...input,reason:"short"},400);
  await nurse.request("/auth/emergency-access",{...input,attested:false},400);
  await nurse.request("/auth/emergency-access",{...input,mrn:"NO-SUCH-RECORD"},404);
  await nurse.request("/auth/emergency-access",{...input,mrn:own.mrn},409);
  await root.request("/auth/emergency-access",input,403);
  await nurse.request(`/patients/${target.id}/clinical-profile`,undefined,403);
  const core=await pool.query<{id:string}>("SELECT p.id FROM care_patients p JOIN care_records r ON r.patient_id=p.id AND r.kind='enrollments' AND r.program='RPM' AND r.status='active' WHERE p.dataset='clinical' AND p.location='Garden City' AND p.mrn LIKE 'MC-%' ORDER BY p.mrn LIMIT 1");
  assert.ok(core.rows[0]);
  const timer=await nurse.request("/actions",{action:"startTimer",patientId:core.rows[0]!.id,program:"RPM",payload:{activity:"review_data"}});
  await nurse.request("/auth/emergency-access",input,409);
  await nurse.request("/actions",{action:"discardTimer",id:timer.record.id,reason:"Fictional local verification completed; no billable care was performed."});
  for(const p of [target,other])await root.request("/records/tasks",{title:`Emergency verification ${suffix}`,patientId:p.id,status:"pending",metadata:{audience:"staff"}},201);
  const emergency=await nurse.request("/auth/emergency-access",{...input,durationHours:99});
  assert.equal(emergency.role,"emergency_read_only");assert.equal(emergency.id,invite.account.id);assert.equal(emergency.credential,"RN");
  assert.equal(emergency.emergencyContext.patientId,target.id);
  assert.ok(Date.parse(emergency.emergencyContext.expiresAt)-Date.parse(emergency.emergencyContext.startedAt)<=4*3600000);
  assert.deepEqual(emergency.permissions,["patients.read","clinical.read"]);
  await nurse.request(`/patients/${target.id}/clinical-profile`);
  await nurse.request(`/patients/${other.id}/clinical-profile`,undefined,403);
  await nurse.request(`/patients/${own.id}/clinical-profile`,undefined,403);
  const roster=JSON.stringify(await nurse.request("/patients"));
  assert.ok(roster.includes(target.id));assert.ok(!roster.includes(other.id));assert.ok(!roster.includes(own.id));
  const tasks=await nurse.request(`/worklists?kind=tasks&q=${encodeURIComponent(`Emergency verification ${suffix}`)}`);
  assert.equal(tasks.items.length,1);assert.equal(tasks.items[0].patientId,target.id);
  const records=JSON.stringify(await nurse.request("/records/tasks"));
  assert.ok(records.includes(target.id));assert.ok(!records.includes(other.id));
  await nurse.request(`/patients/${target.id}/clinical-profile`,{conditions:[]},403,"PATCH");
  await nurse.request("/actions",{action:"startTimer",patientId:target.id,program:"RPM"},403);
  await nurse.request("/records/messages",{patientId:target.id,title:"Not permitted",description:"Emergency mode cannot send messages"},403);
  await nurse.request(`/patients/${target.id}/access-export`,undefined,403);
  await nurse.request("/records/audit",undefined,403);
  await nurse.request("/accounts",undefined,403);
  await nurse.request("/auth/location-context",{location:"Garden City"},409);
  await nurse.request("/auth/emergency-access",input,409);
  assert.equal((await otherSession.request("/auth/me")).role,"care_manager");
  await otherSession.request(`/patients/${target.id}/clinical-profile`,undefined,403);
  const restored=await nurse.request("/auth/emergency-access/end",{});
  assert.equal(restored.role,"care_manager");assert.equal(restored.emergencyContext,null);
  await nurse.request(`/patients/${own.id}/clinical-profile`);
  await nurse.request(`/patients/${target.id}/clinical-profile`,undefined,403);
  await nurse.request("/auth/emergency-access",input);
  const hash=digest(nurse.cookie.slice(nurse.cookie.indexOf("=")+1));
  await pool.query("UPDATE care_sessions SET emergency_context=jsonb_set(jsonb_set(emergency_context,'{startedAt}',to_jsonb($2::text)),'{expiresAt}',to_jsonb($3::text)) WHERE token_hash=$1",[hash,new Date(Date.now()-5*3600000).toISOString(),new Date(Date.now()-3600000).toISOString()]);
  const expired=await nurse.request("/auth/me");assert.equal(expired.emergencyContext,null);assert.equal(expired.role,"care_manager");
  await nurse.request(`/patients/${target.id}/clinical-profile`,undefined,403);
  const events=await pool.query<{action:string;detail:Record<string,unknown>}>("SELECT action,detail FROM care_audit WHERE actor_id=$1 AND patient_id=$2 ORDER BY at",[invite.account.id,target.id]);
  assert.ok(events.rows.some(r=>r.action==="break_glass"&&r.detail.reason===reason&&r.detail.scope==="one_patient_read_only"));
  assert.ok(events.rows.some(r=>r.action==="end_break_glass"));assert.ok(events.rows.filter(r=>r.action==="break_glass_read").length>=3);
  console.log(`PASS ${passed} emergency-access HTTP checks: exact patient scope, read-only permissions, audit, timer guard, isolated sessions, end and server expiry.`);
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
