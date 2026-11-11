import "./validation-fetch";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {pool} from "@workspace/db";
let passed=0;
class Client{
  cookie="";
  async request(path:string,body?:unknown,status=200,method?:string):Promise<any>{
    const r=await fetch(`http://localhost:80/api${path}`,{method:method??(body?"POST":"GET"),headers:{"Content-Type":"application/json",...(this.cookie?{Cookie:this.cookie}:{})},body:body?JSON.stringify(body):undefined});
    assert.equal(r.status,status,`${path}: ${await r.clone().text()}`);passed++;
    if(path==="/auth/login"&&r.ok)this.cookie=r.headers.get("set-cookie")!.split(";")[0]!;
    return r.json();
  }
  async pdf(path:string){
    const r=await fetch(`http://localhost:80${path}`,{headers:{Cookie:this.cookie}});assert.equal(r.status,200);passed++;
    const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),"%PDF-");assert.equal(createHash("sha256").update(bytes).digest("hex"),r.headers.get("x-document-sha256"));
    assert.ok(bytes.length>1000);return bytes;
  }
}
async function run(){
  const root=new Client(),nurse=new Client(),siteAdmin=new Client(),suffix=Date.now();
  await root.request("/auth/login",{email:"demo@mahalo.care",password:"MahaloDemo2026!"});
  async function invite(c:Client,key:string,role:string,location:string){
    const response=await root.request("/accounts",{name:`Governance ${key} verification ${suffix}`,email:`governance-${key}-${suffix}@example.test`,role,credential:"RN",locationScopes:[location]},201);
    const password="GovernanceLocal2026!";
    await c.request("/auth/password/reset",{token:new URL(response.path,"http://localhost").searchParams.get("token"),password});
    const user=await c.request("/auth/login",{email:response.account.email,password});
    return user;
  }
  const n=await invite(nurse,"nurse","care_manager","Garden City"),a=await invite(siteAdmin,"site-admin","clinical_admin","Huntington");
  const directory=await root.request("/records/staff");
  assert.ok(directory.some((r:any)=>r.metadata.userId===n.id&&r.status==="active"&&r.metadata.identitySource==="staff_account"));
  const linked=directory.find((r:any)=>r.metadata.userId===n.id);
  await root.request(`/records/staff/${linked.id}`,{metadata:{credential:"MD"}},409,"PATCH");
  await root.request(`/records/staff/${linked.id}`,{status:"inactive"},409,"PATCH");
  await root.request("/records/staff",{title:"Duplicate managed identity",metadata:{userId:n.id,role:"care_manager",credential:"RN"}},409);
  const p=await root.request("/patients",{firstName:"Governance",lastName:`review verification ${suffix}`,dob:"1955-06-12",location:"Huntington"},201);
  await nurse.request("/auth/emergency-access",{mrn:p.mrn,reason:"A fictional coverage request for local governance verification only.",attested:true});
  await nurse.request(`/patients/${p.id}/clinical-profile`);
  await nurse.request("/auth/emergency-access/end",{});
  const overview=await root.request("/operations/security-overview"),defaults=overview.defaults;
  assert.ok(overview.reportKinds.includes("audit_integrity"));assert.equal(overview.isPracticeAdmin,true);
  const limited=await siteAdmin.request("/operations/security-overview");assert.deepEqual(limited.reportKinds,["weekly_emergency_access"]);
  await nurse.request("/operations/security-overview",undefined,403);
  await root.request("/operations/security-reports",{kind:"access_review",timeZone:"Invalid/Zone"},400);
  await root.request("/operations/security-reports",{kind:"weekly_emergency_access",period:"2026-11-10"},400);
  await root.request("/operations/security-reports",{kind:"access_review",period:"2026-13"},400);
  await root.request("/operations/security-reports",{kind:"access_review",scopeLocations:["Huntington"]},400);
  await siteAdmin.request("/operations/security-reports",{kind:"access_review"},403);
  await siteAdmin.request("/operations/security-reports",{kind:"weekly_emergency_access",includeVerification:true},403);
  const access=await root.request("/operations/security-reports",{kind:"access_review"},201);
  const view=await root.request(`/operations/security-reports/${access.id}`);
  assert.ok(view.accounts.length>=10);assert.ok(!view.accounts.some((u:any)=>u.id===n.id||u.id===a.id));
  assert.equal(view.report.sourceRows,view.accounts.length);
  await siteAdmin.request(`/operations/security-reports/${access.id}`,undefined,403);
  await nurse.request(`/operations/security-reports/${access.id}`,undefined,403);
  await root.pdf(access.pdfUrl);
  const weekly=await root.request("/operations/security-reports",{kind:"weekly_emergency_access",includeVerification:true},201);
  const weeklyView=await root.request(`/operations/security-reports/${weekly.id}`),event=weeklyView.emergencyAccess.find((e:any)=>e.actorId===n.id);
  assert.ok(event);assert.equal(event.patientId,p.id);assert.equal(event.status,"ended");assert.equal(event.roleAtAccess,"care_manager");assert.equal(event.credentialAtAccess,"RN");
  await siteAdmin.request(`/operations/security-reports/${weekly.id}`,undefined,403); // Whole-practice snapshot is not a site-scoped report.
  const scoped=await siteAdmin.request("/operations/security-reports",{kind:"weekly_emergency_access"},201),scopedView=await siteAdmin.request(`/operations/security-reports/${scoped.id}`);
  assert.deepEqual(scopedView.report.scopeLocations,["Huntington"]);assert.ok(!scopedView.emergencyAccess.some((e:any)=>e.actorId===n.id));
  const scopedList=await siteAdmin.request("/operations/security-reports");assert.ok(scopedList.reports.every((r:any)=>r.kind==="weekly_emergency_access"&&r.scopeLocations.length&&r.scopeLocations.every((s:string)=>s==="Huntington")));
  const advanced=await root.request("/operations/security-reports",{kind:"access_review",includeVerification:true},201),old=await root.request(`/operations/security-reports/${advanced.id}`);
  const oldName=old.accounts.find((u:any)=>u.id===n.id).name;
  await root.request(`/accounts/${n.id}`,{name:`Renamed governance verification ${suffix}`},200,"PATCH");
  const frozen=await root.request(`/operations/security-reports/${advanced.id}`);
  assert.equal(frozen.accounts.find((u:any)=>u.id===n.id).name,oldName);
  const updatedDirectory=await root.request("/records/staff");assert.ok(updatedDirectory.some((r:any)=>r.metadata.userId===n.id&&r.title!==oldName));
  const audit=await root.request("/operations/security-reports",{kind:"audit_integrity"},201);
  const exported=await root.request(`/operations/security-reports/${audit.id}/json`);
  assert.equal(exported.report.auditSnapshot.manifest.length,audit.sourceRows);assert.ok(audit.sourceRows>250);
  assert.equal(new Set(exported.report.auditSnapshot.manifest.map((m:any)=>m.id)).size,audit.sourceRows);
  assert.equal(exported.contentDigest,audit.digest);
  const verified=await root.request(`/operations/security-reports/${audit.id}/verify`,{});
  assert.equal(verified.valid,true);assert.equal(verified.privatePdfValid,true);assert.equal(verified.chainMatches,true);
  assert.equal(verified.missingRows,0);assert.equal(verified.changedRows,0);assert.ok(verified.unlistedEvents>0);
  await root.pdf(audit.pdfUrl);
  const firstPage=await root.request("/operations/security-reports?page=1&pageSize=1&kind=audit_integrity");
  assert.equal(firstPage.reports.length,1);assert.ok(firstPage.total>=1);
  await root.request(`/records/security_reports/${audit.id}`,undefined,403);
  await nurse.request("/records/security_reports",undefined,401); // Name update revoked the nurse's existing session.
  await root.request(`/documents/${audit.id}`,undefined,400);
  assert.ok(defaults.month&&defaults.weekStart);
  console.log(`PASS ${passed} governance HTTP checks: scoped reviews, fixture exclusion, frozen account snapshots, directory synchronization, real private PDFs, paginated archive and live audit-chain verification.`);
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
