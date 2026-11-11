import "./validation-fetch";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";

let passed=0;
class Client {
  cookie="";
  async request(path:string,body?:unknown,expected=200,method?:string):Promise<any> {
    const r=await fetch("http://localhost:80/api"+path,{method:method??(body?"POST":"GET"),headers:{"Content-Type":"application/json",...(this.cookie?{Cookie:this.cookie}:{})},body:body?JSON.stringify(body):undefined});
    assert.equal(r.status,expected,`${path}: ${(await r.clone().text()).slice(0,500)}`);
    if(path==="/auth/login"&&r.ok)this.cookie=r.headers.get("set-cookie")!.split(";")[0]!;
    passed++;return r.json();
  }
}
const root=new Client(),family=new Client(),outsider=new Client();
async function run() {
  await root.request("/auth/login",{email:"demo@mahalo.care",password:"MahaloDemo2026!"});
  const suffix=Date.now(),email=`caregiver-${suffix}@example.test`;
  const invitation=await root.request("/accounts",{name:"Jamie Family",email,role:"caregiver",credential:"caregiver",locationScopes:[]},201);
  const token=new URL(invitation.path,"http://localhost").searchParams.get("token");
  await family.request("/auth/password/reset",{token,password:"CaregiverVerification2026!"});
  await family.request("/auth/login",{email,password:"CaregiverVerification2026!"});
  assert.deepEqual((await family.request("/caregiver/patients")).patients,[]);
  await family.request("/patients",undefined,403);
  await family.request("/records/notes",undefined,403);
  await family.request("/operations/demonstration-status",undefined,403);
  const p=await root.request("/patients",{firstName:"Sharing",lastName:`Verification ${suffix}`,dob:"1950-01-10",location:"Garden City",conditions:["Hypertension"]},201),path=`/patients/${p.id}/clinical-profile`;
  let profile=await root.request(path);
  const contact={name:"Jamie Family",relationship:"Daughter",phone:"(516) 555-0198",email,emergency:true,sharingAllowed:false,sharingScope:[]};
  profile=await root.request(path,{expectedUpdatedAt:profile.updatedAt,contacts:[contact]},200,"PATCH");
  const contactId=profile.contacts[0].id;
  const grantBody={contactId,userId:invitation.account.id,scopes:["messages.read","messages.send"],method:"verbal",consentText:"Fictional patient explicitly permits this caregiver to read and send secure messages for this verification.",attested:true};
  await root.request(`/patients/${p.id}/caregivers`,grantBody,400);
  profile=await root.request(path,{expectedUpdatedAt:profile.updatedAt,contacts:[{...profile.contacts[0],sharingAllowed:true,sharingScope:["messages"],consentRecordedAt:new Date().toISOString()}]},200,"PATCH");
  await root.request(`/patients/${p.id}/caregivers`,{...grantBody,scopes:["messages.send"]},400);
  await root.request(`/patients/${p.id}/caregivers`,{...grantBody,scopes:["messages.read","careplans.read"]},400);
  const created=await root.request(`/patients/${p.id}/caregivers`,grantBody,201);
  assert.ok(created.documentId,"Consent must have a real retained private PDF");
  const storage=await pool.query("SELECT storage_backend,sha256 FROM care_documents WHERE id=$1",[created.documentId]);
  assert.equal(storage.rows[0].storage_backend,"app_storage_private");assert.match(storage.rows[0].sha256,/^[a-f0-9]{64}$/);
  await root.request(`/patients/${p.id}/caregivers`,grantBody,409);
  const list=await family.request("/caregiver/patients");assert.equal(list.patients.length,1);assert.equal(list.patients[0].id,p.id);
  const shared=await family.request(`/caregiver/patients/${p.id}`);
  assert.ok(Array.isArray(shared.messages));assert.equal(shared.careplans,undefined);assert.equal(shared.readings,undefined);assert.equal(shared.clinicalProfile,undefined);
  assert.deepEqual(shared.programs,[],"Message-only permission must not disclose sensitive program enrollment");
  await family.request(`/patients/${p.id}/clinical-profile`,undefined,403);
  await family.request(`/patients/${p.id}/access-export`,undefined,403);
  await family.request(`/caregiver/patients/${p.id}/careplans/not-authorized/pdf`,undefined,403);
  await family.request(`/caregiver/patients/${p.id}/messages`,{message:"Fictional family follow-up: we would like the care team to confirm the next planned conversation."},201);
  const messages=await root.request(`/records/messages?patientId=${p.id}`),sent=messages.find((m:any)=>m.metadata.senderRole==="caregiver");
  assert.ok(sent);assert.equal(sent.createdBy,invitation.account.id);assert.equal(sent.metadata.reportedOnBehalfOfPatient,true);
  await family.request("/actions",{action:"startTimer",patientId:p.id,program:"RPM"},403);
  const other=await root.request("/patients",{firstName:"Unshared",lastName:`Verification ${suffix}`,dob:"1951-01-10",location:"Garden City"},201);
  await family.request(`/caregiver/patients/${other.id}`,undefined,403);
  profile=await root.request(path);
  profile=await root.request(path,{expectedUpdatedAt:profile.updatedAt,contacts:[{...profile.contacts[0],sharingAllowed:false,sharingScope:[],consentRecordedAt:null}]},200,"PATCH");
  assert.deepEqual((await family.request("/caregiver/patients")).patients,[]);
  await family.request(`/caregiver/patients/${p.id}`,undefined,403);
  await family.request(`/caregiver/patients/${p.id}/messages`,{message:"Must not be accepted after withdrawal."},403);
  const rows=await root.request(`/patients/${p.id}/caregivers`);assert.equal(rows.grants[0].status,"revoked");
  profile=await root.request(path,{expectedUpdatedAt:profile.updatedAt,contacts:[{...profile.contacts[0],sharingAllowed:true,sharingScope:["messages"],consentRecordedAt:new Date().toISOString()}]},200,"PATCH");
  await family.request(`/caregiver/patients/${p.id}`,undefined,403,"GET");
  const renewed=await root.request(`/patients/${p.id}/caregivers`,grantBody,201);
  await family.request(`/caregiver/patients/${p.id}`);
  await pool.query("UPDATE care_caregiver_grants SET scopes=$2::jsonb WHERE id=$1",[renewed.grant.id,JSON.stringify(["messages.read"])]);
  await family.request(`/caregiver/patients/${p.id}`,undefined,403);
  await pool.query("UPDATE care_caregiver_grants SET scopes=$2::jsonb WHERE id=$1",[renewed.grant.id,JSON.stringify(grantBody.scopes)]);
  await family.request(`/caregiver/patients/${p.id}`);
  await pool.query("UPDATE care_caregiver_grants SET expires_at=now()-interval '1 second' WHERE id=$1",[renewed.grant.id]);
  await family.request(`/caregiver/patients/${p.id}`,undefined,403);
  await root.request(`/patients/${p.id}/caregivers/${renewed.grant.id}/revoke`,{reason:"Fictional verification permission has ended."});
  await outsider.request("/caregiver/patients",undefined,401);
  await family.request("/auth/logout",{});await root.request("/auth/logout",{});
  console.log(JSON.stringify({passed,status:"passed",scope:"Normal invitations, consent PDF retention, least-privilege family access, message provenance, expiry, withdrawal and non-resurrection"}));
}
run().catch(error=>{console.error(error instanceof Error?error.stack:String(error));process.exitCode=1;}).finally(()=>pool.end());
