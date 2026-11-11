import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,pool,users,sessions} from "@workspace/db";
import {eq} from "drizzle-orm";
import {hashPassword} from "./lib/passwords";
const run=randomUUID().slice(0,8),scopedId=`worklist-${run}`;
let passed=0;
function client() {
  let cookie="";
  return {async request(path:string,body?:unknown,expected=200,method=body===undefined?"GET":"POST") {
    const res=await fetch(`http://localhost:80/api${path}`,{method,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    if(res.headers.getSetCookie().some(c=>c.startsWith("mahalo_session="))) cookie=res.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
    const text=await res.text();assert.equal(res.status,expected,`${method} ${path}: ${text.slice(0,200)}`);passed++;return JSON.parse(text);
  }};
}
const admin=client(),consultant=client(),care=client(),front=client(),readonly=client(),patient=client(),behavioral=client(),scoped=client();
const login=(c:ReturnType<typeof client>,email:string,password="MahaloDemo2026!")=>c.request("/auth/login",{email,password});
const query=(kind:string,extra="")=>{
  const params=new URLSearchParams({kind,q:"",program:"",locations:"",assignee:"",ownerRole:"",period:"",status:"open",pageSize:"10",includeInactive:"false"});
  for(const [key,value] of new URLSearchParams(extra.replace(/^&/,""))) params.set(key,value);
  return `/worklists?${params}`;
};
async function main() {
  const created:string[]=[],deviceIds:string[]=[],enrollments:string[]=[];
  let original:any;
  await login(admin,"demo@mahalo.care");
  try {
    original=await admin.request("/workspace/preferences");
    for(const kind of ["my_exceptions","team_queue","due_today","tasks","at_risk","unsigned","device_issues","cocm_registry"]) {
      const page=await admin.request(query(kind));assert.ok(page.items.length<=10);assert.equal(page.kind,kind);assert.equal(page.page,1);assert.ok(page.total>=page.items.length);
    }
    await admin.request("/worklists?kind=tasks&page=0",undefined,400);
    await admin.request("/worklists?kind=tasks&period=7d",undefined,400);
    await admin.request("/worklists?kind=tasks&patientId=forged",undefined,400);
    await login(consultant,"consultant@mahalo.care");await login(care,"caremanager@mahalo.care");await login(front,"frontdesk@mahalo.care");await login(readonly,"readonly@mahalo.care");await login(patient,"patient@mahalo.care");await login(behavioral,"behavioral@mahalo.care");
    await front.request(query("team_queue"),undefined,403);await front.request(query("device_issues"));
    await patient.request(query("tasks"),undefined,403);await patient.request("/workspace/preferences",undefined,403);
    await behavioral.request(query("cocm_registry"));await consultant.request(query("cocm_registry"));
    const readonlyPrefs=await readonly.request("/workspace/preferences");
    await admin.request("/workspace/preferences",{density:"compact",worklist:{kind:"team_queue",filters:{q:run,locations:["Garden City"],pageSize:10,status:"all"}}},200,"PATCH");
    await admin.request("/workspace/preferences",{worklist:{kind:"tasks",filters:{q:`task-${run}`,pageSize:25}}},200,"PATCH");
    const prefs=await admin.request("/workspace/preferences");assert.equal(prefs.density,"compact");assert.equal(prefs.lastWorklist,"tasks");assert.equal(prefs.worklists.team_queue.q,run);assert.equal(prefs.worklists.tasks.q,`task-${run}`);
    assert.deepEqual(await readonly.request("/workspace/preferences"),readonlyPrefs);
    const restored=await admin.request("/worklists?kind=team_queue");assert.equal(restored.appliedFilters.q,run);
    assert.equal((await admin.request(query("team_queue"))).appliedFilters.q,"");
    const p1=await admin.request("/patients",{firstName:"Synthetic",lastName:`Worklist ${run}`,dob:"1960-01-01",location:"Garden City",conditions:["Depression","Hypertension"],timezone:"America/New_York"},201);created.push(p1.id);
    const p2=await admin.request("/patients",{firstName:"Synthetic",lastName:`Outside ${run}`,dob:"1960-01-01",location:"Babylon",conditions:["Hypertension"]},201);created.push(p2.id);
    await db.insert(users).values({id:scopedId,email:`${scopedId}@example.test`,name:`Scoped ${run}`,role:"care_manager",credential:"RN",locationScopes:["Garden City"],passwordHash:await hashPassword("WorklistVerify2026!")});
    await login(scoped,`${scopedId}@example.test`,"WorklistVerify2026!");
    const e1=await admin.request("/records/exceptions",{patientId:p1.id,program:"BHI",title:`Queue ${run}`,status:"open",severity:"high",assignee:`Scoped ${run}`,metadata:{ownerUserId:scopedId,ownerRole:"care_manager"}},201);
    const e2=await admin.request("/records/exceptions",{patientId:p2.id,program:"RPM",title:`Outside queue ${run}`,status:"open",severity:"critical",metadata:{ownerRole:"care_manager"}},201);
    const ordered=await admin.request(query("team_queue",`&q=${run}`));assert.deepEqual(ordered.items.map((r:any)=>r.id),[e2.id,e1.id]);
    const mine=await scoped.request(query("my_exceptions",`&q=${run}`));assert.deepEqual(mine.items.map((r:any)=>r.id),[e1.id]);
    const team=await scoped.request(query("team_queue",`&q=${run}`));assert.ok(team.items.every((r:any)=>r.location==="Garden City"));assert.ok(!team.items.some((r:any)=>r.id===e2.id));
    await scoped.request(`/worklists?kind=tasks&locations=Babylon`,undefined,403);
    await scoped.request("/worklists/assign",{ids:[e1.id,e2.id],assigneeId:"demo-caremanager"},403);
    assert.equal((await admin.request(`/records/exceptions/${e1.id}`)).assignee,`Scoped ${run}`);
    await readonly.request("/worklists/assign",{ids:[e1.id],assigneeId:"demo-caremanager"},403);
    await admin.request("/worklists/assign",{ids:[e1.id,e1.id],assigneeId:"demo-caremanager"},400);
    const result=await admin.request("/worklists/assign",{ids:[e1.id],assigneeId:"demo-caremanager"});assert.equal(result.count,1);assert.equal(result.records[0].metadata.ownerUserId,"demo-caremanager");
    const careMine=await care.request(query("my_exceptions",`&q=${run}`));assert.ok(careMine.items.some((r:any)=>r.id===e1.id));
    const task=await admin.request("/records/tasks",{patientId:p1.id,program:"BHI",title:`Staff task ${run}`,status:"pending",metadata:{audience:"staff",dueAt:new Date().toISOString(),ownerUserId:"demo-caremanager"}},201);
    for(let i=0;i<11;i++) await admin.request("/records/tasks",{patientId:p1.id,program:"BHI",title:`Paged staff ${run} ${i}`,status:"pending",metadata:{audience:"staff",dueAt:new Date().toISOString()}},201);
    const first=await admin.request(query("tasks",`&q=${run}&page=1`)),second=await admin.request(query("tasks",`&q=${run}&page=2`));
    assert.equal(first.total,12);assert.equal(first.items.length,10);assert.equal(second.items.length,2);assert.ok(second.items.every((r:any)=>!first.items.some((f:any)=>f.id===r.id)));
    assert.equal(task.assignee,"Elena Garcia");assert.equal(task.metadata.ownerRole,"care_manager");
    await admin.request("/records/tasks",{patientId:p1.id,title:"Invalid time",metadata:{audience:"staff",dueAt:"Tomorrow"}},400);
    await admin.request("/records/tasks",{patientId:p2.id,title:"Out-of-scope owner",metadata:{audience:"staff",ownerUserId:scopedId}},403);
    assert.ok((await admin.request(query("due_today",`&q=${run}`))).items.some((r:any)=>r.id===task.id));
    const patientTask=await admin.request("/records/tasks",{patientId:p1.id,program:"BHI",title:`Patient reading ${run}`,status:"pending",metadata:{audience:"patient",taskKind:"reading",dueAt:new Date().toISOString()}},201);
    assert.ok(!(await admin.request(query("tasks",`&q=${run}`))).items.some((r:any)=>r.id===patientTask.id));
    await admin.request("/worklists/assign",{ids:[patientTask.id],assigneeId:"demo-caremanager"},409);
    const note=await admin.request("/records/notes",{patientId:p1.id,program:"BHI",title:`Unsigned ${run}`,description:"Synthetic local verification note. No real patient care was performed."},201);
    assert.ok((await admin.request(query("unsigned",`&q=${run}`))).items.some((r:any)=>r.id===note.id));
    await admin.request("/actions",{action:"signNote",id:note.id});
    await admin.request("/worklists/assign",{ids:[e1.id,note.id],assigneeId:"demo-consultant"},409);
    assert.equal((await admin.request(`/records/exceptions/${e1.id}`)).metadata.ownerUserId,"demo-caremanager");
    const device=await admin.request("/records/devices",{patientId:p2.id,program:"RPM",title:`Device ${run}`,status:"assigned",metadata:{serial:`worklist-${run}`,battery:10}},201);deviceIds.push(device.id);
    const issues=await front.request(query("device_issues",`&q=${run}`));assert.ok(issues.items.some((r:any)=>r.id===device.id&&r.issueReasons.includes("Battery below 20%")));
    await front.request("/worklists/assign",{ids:[device.id],assigneeId:"demo-frontdesk"});
    await front.request("/worklists/assign",{ids:[task.id],assigneeId:"demo-caremanager"},403);
    const enrolled=await admin.request("/actions",{action:"enroll",patientId:p1.id,program:"BHI",payload:{consent:true,cocm:true,hasConsultant:true,hasAssessment:true}});enrollments.push(enrolled.record.id);
    const score=async(instrument:string,answers:number[])=>admin.request("/actions",{action:"submitCheckin",patientId:p1.id,program:"BHI",payload:{instrument,answers}});
    await score("phq9",[1,1,1,1,1,1,1,1,0]);await score("phq9",[2,2,2,2,2,2,2,2,0]);await score("gad7",[1,1,1,1,1,1,1]);
    await admin.request("/records/interactions",{patientId:p1.id,program:"BHI",title:"Synthetic manual live contact",status:"completed",metadata:{kind:"phone",isLiveTwoWay:true,driver:"manual"}},201);
    const before=(await admin.request(query("cocm_registry",`&q=${run}`))).items[0];assert.equal(before.latestPhq9,16);assert.equal(before.latestGad7,7);assert.equal(before.scoreTrend,8);assert.equal(before.consultantReviewDue,true);assert.ok(before.lastContactAt);
    const review={patientId:p1.id,summary:"Synthetic consultant review of the case for local verification; no real patient care was delivered.",nextReviewDays:7};
    await admin.request("/worklists/consultant-review",review,403);await care.request("/worklists/consultant-review",review,403);await readonly.request("/worklists/consultant-review",review,403);
    await consultant.request("/worklists/consultant-review",{...review,nextReviewDays:0},400);
    const reviewed=await consultant.request("/worklists/consultant-review",review);assert.equal(reviewed.metadata.reviewerRole,"psychiatric_consultant");assert.equal(reviewed.metadata.reviewedById,"demo-consultant");
    const after=(await admin.request(query("cocm_registry",`&q=${run}`))).items[0];assert.equal(after.consultantReviewDue,false);assert.ok(after.consultantReviewAt);assert.ok(after.nextConsultantReviewAt);
    await admin.request(`/records/interactions/${reviewed.id}`,{description:"Altered"},400,"PATCH");
    await admin.request("/records/interactions",{patientId:p1.id,title:"Forged review",metadata:{kind:"consultant_review"}},400);
    await admin.request(`/patients/${p2.id}`,{status:"inactive"},200,"PATCH");
    assert.ok((await front.request(query("device_issues",`&q=${run}`))).items.some((r:any)=>r.id===device.id));
    const page=await admin.request(query("team_queue","&page=99999"));assert.equal(page.page,page.totalPages);
  } finally {
    for(const id of deviceIds) await admin.request(`/records/devices/${id}`,{status:"returned"},200,"PATCH");
    for(const id of enrollments) await admin.request("/actions",{action:"discharge",id,reason:"Synthetic worklist verification completed"});
    for(const id of created) await admin.request(`/patients/${id}`,{status:"inactive"},200,"PATCH");
    if(original) {
      for(const kind of ["team_queue","tasks"]) await admin.request("/workspace/preferences",{worklist:{kind,filters:original.worklists[kind]??{}}},200,"PATCH");
      await admin.request("/workspace/preferences",{density:original.density,worklist:{kind:original.lastWorklist,filters:original.worklists[original.lastWorklist]??{}}},200,"PATCH");
    }
    await db.update(users).set({status:"inactive"}).where(eq(users.id,scopedId));
    await db.delete(sessions).where(eq(sessions.userId,scopedId));
  }
  console.log(`PASS ${passed} worklist HTTP cases: scoped database pagination, saved filters, role boundaries, atomic assignment, patient/staff task isolation and qualified CoCM reviews.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
