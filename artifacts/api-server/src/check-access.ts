import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, users, jobs, ingestInbox, sessions } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signDeviceEvent } from "./lib/device-ingestion";

const run=randomUUID().slice(0,8),password="SyntheticAccess2026!";
let checks=0;
class Client {
  cookie="";
  async request(path:string,body?:unknown,status=200,method=body===undefined?"GET":"POST",headers:Record<string,string>={}) {
    const response=await fetch(`http://localhost:80/api${path}`,{method,headers:{"Content-Type":"application/json",...(this.cookie?{Cookie:this.cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const cookies=response.headers.getSetCookie();
    if(cookies.some(x=>x.startsWith("mahalo_session="))) this.cookie=cookies.map(x=>x.split(";")[0]).join("; ");
    const text=await response.text();
    assert.equal(response.status,status,`${method} ${path}: ${text.slice(0,300)}`);checks++;
    return response.headers.get("content-type")?.includes("json")?JSON.parse(text):text;
  }
}
const admin=new Client(),fresh=new Client(),ids:string[]=[],createdPatients:string[]=[];
const login=(c:Client,email:string,p=password)=>c.request("/auth/login",{email,password:p});
async function account(role:string,locationScopes:string[]=[],patientId?:string) {
  const email=`access-${role}-${run}@example.test`;
  const invitation=await admin.request("/accounts",{name:`Synthetic ${role} ${run}`,email,role,credential:role==="billing"?"billing":role==="patient"?"patient":"RN",locationScopes,patientId},201);
  ids.push(invitation.account.id);
  assert.equal(invitation.account.status,"invited");
  assert.ok(!JSON.stringify(invitation.account).includes("passwordHash"));
  const token=new URL(invitation.path,"https://example.test").searchParams.get("token");
  const u=new Client();
  await u.request("/auth/password/reset",{token,password});
  await u.request("/auth/password/reset",{token,password},400);
  await login(u,email);
  return {client:u,email,id:invitation.account.id};
}
async function waitJob(jobId:string,expectedStatus="completed") {
  for(let i=0;i<80;i++) {
    const [job]=await db.select().from(jobs).where(eq(jobs.id,jobId));
    if(job?.status===expectedStatus) return job;
    if(job?.status==="failed") throw new Error(`Job failed: ${job.error}`);
    await new Promise(r=>setTimeout(r,250));
  }
  throw new Error("Job did not complete");
}
try {
  await fresh.request("/accounts",undefined,401);
  await login(admin,"demo@mahalo.care","MahaloDemo2026!");
  const initialAccounts=await admin.request("/accounts");
  if(initialAccounts.filter((a:{role:string;status:string})=>a.role==="admin"&&a.status==="active").length===1) await admin.request("/accounts/demo-admin",{role:"care_manager"},409,"PATCH");
  const p=await admin.request("/patients",{firstName:"SyntheticAccess",lastName:run,dob:"1965-01-01",location:"Garden City",conditions:["Hypertension"]},201);
  const other=await admin.request("/patients",{firstName:"SyntheticOther",lastName:run,dob:"1965-01-01",location:"Smithtown",conditions:["Hypertension"]},201);
  createdPatients.push(p.id,other.id);
  const scoped=await account("care_manager",["Garden City"]);
  const readOnly=await account("read_only",["Garden City"]);
  const linked=await account("patient",[],p.id);
  // Multiple independent onboarding tokens behind one practice/NAT must not share the old eight-reset ceiling.
  let invalidToken="";
  for(let n=0;n<9;n++) {
    const token=randomUUID().replaceAll("-","").repeat(2);if(n===0) invalidToken=token;
    await fresh.request("/auth/password/reset",{token,password},400);
  }
  for(let n=0;n<4;n++) await fresh.request("/auth/password/reset",{token:invalidToken,password},400);
  await fresh.request("/auth/password/reset",{token:invalidToken,password},429);
  const list=await scoped.client.request("/patients");
  assert.ok(list.some((x:{id:string})=>x.id===p.id));
  assert.ok(list.every((x:{location:string})=>x.location==="Garden City"));
  await scoped.client.request(`/patients/${other.id}`,undefined,403);
  await scoped.client.request("/actions",{action:"simulateReading",patientId:other.id,program:"RPM"},403);
  await scoped.client.request("/accounts",undefined,403);
  await scoped.client.request("/settings",{name:"Forbidden"},403,"PATCH");
  await scoped.client.request("/actions",{action:"calculateBilling"},403);
  await readOnly.client.request("/patients",{firstName:"No",lastName:"Write",dob:"1965-01-01",location:"Garden City"},403);
  await readOnly.client.request("/records/notes",{patientId:p.id,title:"Forbidden"},403);
  const csv=await scoped.client.request("/exports/patients");
  assert.ok(!csv.includes(other.id));
  await linked.client.request("/accounts",undefined,403);
  await linked.client.request("/auth/sessions");
  await linked.client.request(`/patients/${other.id}`,undefined,403);
  const me=await scoped.client.request("/auth/me");
  assert.ok(me.permissions.includes("clinical.write"));
  // Browser mutation without its double-submit token must fail even with a valid session.
  await scoped.client.request("/records/notes",{patientId:p.id,title:"CSRF blocked"},403,"POST",{Origin:"http://localhost"});

  await admin.request("/actions",{action:"enroll",patientId:p.id,program:"RPM",payload:{consent:true,deviceSharing:true}});
  const device=await admin.request("/records/devices",{title:`Synthetic webhook ${run}`,patientId:p.id,program:"RPM",status:"assigned",metadata:{serial:`SIGNED-${run}`,setupCompleted:true,deviceCleared:true}},201);
  const accepted=await admin.request("/operations/device-simulate",{deviceId:device.id,pattern:"normal"},202);
  const [job]=await db.select().from(jobs).where(eq(jobs.dedupeKey,`inbox:${accepted.id}`));
  assert.ok(job); await waitJob(job!.id);
  const inbox=await admin.request("/operations/inbox");
  assert.equal(inbox.find((x:{id:string})=>x.id===accepted.id)?.status,"processed");
  let chart=await admin.request(`/patients/${p.id}`);
  const normalized=chart.records.find((r:{kind:string;metadata:Record<string,unknown>})=>r.kind==="observations"&&r.metadata.inboxId===accepted.id);
  assert.equal(normalized.metadata.valid,true);assert.equal(normalized.metadata.deviceCleared,true);
  const payload={eventId:`replay-${run}`,deviceSerial:`SIGNED-${run}`,readings:[{loinc:"8480-6",value:126,diastolic:82,unit:"mmHg",measuredAt:new Date(Date.now()-5000).toISOString()}]};
  const timestamp=String(Date.now()),raw=Buffer.from(JSON.stringify(payload)),signature=signDeviceEvent(timestamp,raw);
  await fresh.request("/webhooks/devices/simulator",payload,401,"POST",{"x-mahalo-timestamp":timestamp,"x-mahalo-signature":"0".repeat(64)});
  const first=await fresh.request("/webhooks/devices/simulator",payload,202,"POST",{"x-mahalo-timestamp":timestamp,"x-mahalo-signature":signature});
  const replay=await fresh.request("/webhooks/devices/simulator",payload,202,"POST",{"x-mahalo-timestamp":timestamp,"x-mahalo-signature":signature});
  assert.equal(first.id,replay.id);
  const changed={...payload,readings:[{...payload.readings[0],value:150}]};
  await fresh.request("/webhooks/devices/simulator",changed,409,"POST",{"x-mahalo-timestamp":timestamp,"x-mahalo-signature":signDeviceEvent(timestamp,Buffer.from(JSON.stringify(changed)))});
  const invalid=await admin.request("/operations/device-simulate",{deviceId:device.id,pattern:"invalid"},202);
  const [invalidJob]=await db.select().from(jobs).where(eq(jobs.dedupeKey,`inbox:${invalid.id}`));await waitJob(invalidJob!.id);
  chart=await admin.request(`/patients/${p.id}`);
  assert.equal(chart.records.find((r:{metadata:Record<string,unknown>})=>r.metadata.inboxId===invalid.id)?.metadata.valid,false);
  const badUnit={...payload,eventId:`bad-unit-${run}`,readings:[{...payload.readings[0],unit:"kPa"}]};
  const badTime=String(Date.now());
  const failedEvent=await fresh.request("/webhooks/devices/simulator",badUnit,202,"POST",{"x-mahalo-timestamp":badTime,"x-mahalo-signature":signDeviceEvent(badTime,Buffer.from(JSON.stringify(badUnit)))});
  const [failedJob]=await db.select().from(jobs).where(eq(jobs.dedupeKey,`inbox:${failedEvent.id}`));
  const exhausted=await waitJob(failedJob!.id,"failed");assert.equal(exhausted.attempts,3);
  assert.equal((await admin.request("/operations/inbox")).find((x:{id:string})=>x.id===failedEvent.id)?.status,"failed");
  await admin.request(`/operations/jobs/${failedJob!.id}/retry`,{});
  await scoped.client.request("/operations/jobs",undefined,403);
  const maintenance=await admin.request("/operations/jobs",{kind:"notifications"},201);await waitJob(maintenance.id);
  await admin.request(`/operations/jobs/${maintenance.id}/retry`,{},409);
  await admin.request("/actions",{action:"calculateBilling",payload:{period:"2099-01"}},400);
  const patients=await admin.request("/patients"),outsideIds=new Set(patients.filter((x:{location:string})=>x.location!=="Garden City").map((x:{id:string})=>x.id));
  const billingAccount=await account("billing",["Garden City"]);
  const frontDesk=await account("front_desk",["Garden City"]);
  await frontDesk.client.request(`/patients/${p.id}`,undefined,403);
  await frontDesk.client.request(`/patients/${p.id}`,{conditions:["Unauthorized diagnosis"]},403,"PATCH");
  await frontDesk.client.request(`/patients/${p.id}`,{status:"inactive"},403,"PATCH");
  await frontDesk.client.request(`/patients/${p.id}`,{phone:"000-000-0000"},200,"PATCH");
  const allLines=await admin.request("/records/billing"),outsideLine=allLines.find((x:{patientId:string})=>outsideIds.has(x.patientId));
  if(outsideLine) await billingAccount.client.request("/actions",{action:"bulkApproveLines",payload:{ids:[outsideLine.id]}},403);
  await linked.client.request("/actions",{action:"updatePreferences",patientId:other.id,payload:{email:false,sms:false,push:false}},403);
  await linked.client.request("/actions",{action:"updatePreferences",payload:{email:false,sms:false,push:true}});
  const withPreferences=await linked.client.request(`/patients/${p.id}`);
  assert.deepEqual(withPreferences.patient.communicationPreferences,{email:false,sms:false,push:true});
  await linked.client.request("/actions",{action:"disconnectDevice",id:device.id,reason:"Synthetic patient disconnect test"});
  const disconnectedChart=await linked.client.request(`/patients/${p.id}`);
  assert.equal(disconnectedChart.records.find((r:{id:string})=>r.id===device.id)?.status,"disconnected");
  assert.ok(!disconnectedChart.records.some((r:{kind:string;metadata:Record<string,unknown>})=>r.kind==="tasks"&&r.metadata.audience==="staff"));
  await admin.request("/operations/device-simulate",{deviceId:device.id,pattern:"normal"},422);
  const ehr=await admin.request("/actions",{action:"syncEhr",patientId:p.id});
  assert.equal(ehr.record.metadata.source,"fhir_fixture");
  assert.equal(ehr.record.metadata.matchedBy,"mrn");
  assert.ok(ehr.record.metadata.resources.some((r:{resourceType:string})=>r.resourceType==="Patient"));
  const consent=disconnectedChart.records.find((r:{kind:string})=>r.kind==="consents");
  await linked.client.request("/actions",{action:"revokeConsent",id:consent.id,reason:"Synthetic withdrawal verification"});
  await linked.client.request("/actions",{action:"submitCheckin",program:"RPM",payload:{instrument:"pain_nrs",answers:[3]}},409);
  await linked.client.request("/actions",{action:"recordAdherence",program:"RPM",payload:{kind:"exercise",title:"Synthetic activity",status:"done"}},409);

  const sessionsBefore=await scoped.client.request("/auth/sessions");assert.ok(sessionsBefore.some((s:{current:boolean})=>s.current));
  await admin.request(`/accounts/${scoped.id}`,{status:"inactive"},200,"PATCH");
  await scoped.client.request("/auth/me",undefined,401);
  await scoped.client.request("/auth/login",{email:scoped.email,password},401);
  await admin.request(`/accounts/${scoped.id}`,{status:"active"},200,"PATCH");
  await login(scoped.client,scoped.email);
  await scoped.client.request("/auth/password/change",{currentPassword:"incorrect",password:"DifferentSynthetic2026!"},400);
  await scoped.client.request("/auth/password/change",{currentPassword:password,password:"DifferentSynthetic2026!"});
  await scoped.client.request("/auth/me",undefined,401);
  await login(scoped.client,scoped.email,"DifferentSynthetic2026!");
  const active=await scoped.client.request("/auth/sessions"),current=active.find((s:{current:boolean})=>s.current);
  await scoped.client.request(`/auth/sessions/${current.id}/revoke`,{});
  await scoped.client.request("/auth/me",undefined,401);
  process.stdout.write(`Passed ${checks} real access/account/job/webhook HTTP checks plus database assertions.\n`);
} finally {
  for(const accountId of ids) {
    await db.update(users).set({status:"inactive"}).where(eq(users.id,accountId));
    await db.delete(sessions).where(eq(sessions.userId,accountId));
  }
  for(const patientId of createdPatients) await admin.request(`/patients/${patientId}`,{firstName:"SyntheticAccess",lastName:run,dob:"1965-01-01",location:patientId===createdPatients[0]?"Garden City":"Smithtown",status:"inactive"},200,"PATCH").catch(()=>{});
  await (await import("@workspace/db")).pool.end();
}
