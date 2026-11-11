import "./validation-fetch";
import assert from "node:assert/strict";
import {pool} from "@workspace/db";

let passed=0;
class Client {
  cookie="";
  async request(path:string,body?:unknown,status=200,method?:string):Promise<any>{
    const r=await fetch(`http://localhost:80/api${path}`,{method:method??(body?"POST":"GET"),headers:{"Content-Type":"application/json",...(this.cookie?{Cookie:this.cookie}:{})},body:body?JSON.stringify(body):undefined});
    assert.equal(r.status,status,`${path}: ${await r.clone().text()}`);passed++;
    if(path==="/auth/login"&&r.ok)this.cookie=r.headers.get("set-cookie")!.split(";")[0]!;
    return r.json();
  }
}
async function run(){
  const root=new Client(),staff=new Client(),second=new Client(),suffix=Date.now();
  await root.request("/auth/login",{email:"demo@mahalo.care",password:"MahaloDemo2026!"});
  const body={name:`Site access verification ${suffix}`,email:`site-access-${suffix}@example.test`,role:"care_manager",credential:"RN",locationScopes:[],siteRoles:{"Garden City":"care_manager","Huntington":"front_desk"}};
  await root.request("/accounts",{...body,npi:"1234567890"},400);
  await root.request("/accounts",{...body,siteRoles:{"Garden City":"admin"}},400);
  await root.request("/accounts",{...body,role:"admin"},400);
  await root.request("/accounts",{...body,siteRoles:{"Unregistered Site":"care_manager"}},400);
  const invite=await root.request("/accounts",{...body,npi:"1234567893"},201);
  assert.equal(invite.account.npi,"1234567893");assert.deepEqual(invite.account.locationScopes,["Garden City","Huntington"]);
  const token=new URL(invite.path,"http://localhost").searchParams.get("token"),credentials={email:body.email,password:"SiteRoleVerification2026!"};
  await staff.request("/auth/password/reset",{token,password:credentials.password});
  const me=await staff.request("/auth/login",credentials);
  assert.equal(me.role,"care_manager");assert.equal(me.activeLocation,"Garden City");assert.equal(me.baseRole,"care_manager");
  assert.deepEqual(me.locationScopes,["Garden City"]);assert.equal(me.npi,"1234567893");
  await second.request("/auth/login",credentials);
  const garden=await root.request("/patients",{firstName:"Site",lastName:`Garden verification ${suffix}`,dob:"1955-01-10",location:"Garden City"},201);
  const hick=await root.request("/patients",{firstName:"Site",lastName:`Huntington verification ${suffix}`,dob:"1956-01-10",location:"Huntington"},201);
  await staff.request(`/patients/${garden.id}/clinical-profile`);
  await staff.request(`/patients/${hick.id}`,undefined,403);
  const task={title:"Review care routine",status:"pending",metadata:{audience:"staff",ownerUserId:invite.account.id}};
  const assigned=await root.request("/records/tasks",{...task,patientId:garden.id},201);
  assert.equal(assigned.metadata.ownerRole,"care_manager");
  await root.request("/records/tasks",{...task,patientId:hick.id},403);
  const core=await pool.query<{id:string}>("SELECT p.id FROM care_patients p JOIN care_records r ON r.patient_id=p.id AND r.kind='enrollments' AND r.program='RPM' AND r.status='active' WHERE p.dataset='clinical' AND p.location='Garden City' AND p.mrn LIKE 'MC-%' ORDER BY p.mrn LIMIT 1");
  assert.ok(core.rows[0],"Prepared Garden City RPM case is required");
  const timer=await staff.request("/actions",{action:"startTimer",patientId:core.rows[0]!.id,program:"RPM",payload:{activity:"review_data"}});
  await staff.request("/auth/location-context",{location:"Huntington"},409);
  await staff.request("/actions",{action:"discardTimer",id:timer.record.id,reason:"Synthetic local verification finished; no billable care was performed."});
  const hickMe=await staff.request("/auth/location-context",{location:"Huntington",role:"admin",permissions:["admin"]});
  assert.equal(hickMe.role,"front_desk");assert.deepEqual(hickMe.locationScopes,["Huntington"]);assert.ok(!hickMe.permissions.includes("clinical.write"));
  assert.equal((await second.request("/auth/me")).activeLocation,"Garden City");
  await staff.request(`/patients/${garden.id}`,undefined,403);
  const roster=await staff.request("/patients");
  assert.ok(JSON.stringify(roster).includes(hick.id));assert.ok(!JSON.stringify(roster).includes(garden.id));
  await staff.request(`/patients/${hick.id}`,undefined,403);
  await staff.request(`/patients/${hick.id}/clinical-profile`,undefined,403);
  await staff.request("/accounts",undefined,403);
  await staff.request("/auth/location-context",{location:"Unassigned"},403);
  await staff.request("/auth/location-context",{location:"toString"},403);
  const restored=await staff.request("/auth/location-context",{location:"Garden City"});
  assert.equal(restored.role,"care_manager");await staff.request(`/patients/${garden.id}/clinical-profile`);
  await root.request(`/accounts/${invite.account.id}`,{siteRoles:{"Garden City":"read_only"},npi:null},200,"PATCH");
  await staff.request("/auth/me",undefined,401);await second.request("/auth/me",undefined,401);
  const limited=await staff.request("/auth/login",credentials);
  assert.equal(limited.role,"read_only");assert.equal(limited.npi,null);
  await staff.request("/auth/location-context",{location:"Huntington"},403);
  await staff.request("/actions",{action:"startTimer",patientId:garden.id,program:"RPM"},403);
  await root.request(`/accounts/${invite.account.id}`,{siteRoles:{},locationScopes:["Garden City"]},200,"PATCH");
  const legacy=await staff.request("/auth/login",credentials);
  assert.equal(legacy.role,"care_manager");assert.equal(legacy.activeLocation,null);assert.deepEqual(legacy.locationScopes,["Garden City"]);
  await staff.request("/auth/location-context",{location:"Garden City"},403);
  console.log(`PASS ${passed} staff-site-role/NPI HTTP checks, isolated session contexts, assignment eligibility, timer protection and revocation.`);
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
