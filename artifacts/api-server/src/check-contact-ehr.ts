import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db,pool,patients,records} from "@workspace/db";
import {eq,inArray,and} from "drizzle-orm";
import {addRecord} from "./lib/store";
import {systemActor} from "./lib/device-ingestion";
import {captureNotificationOutbox} from "./lib/notification-outbox";
let cookie="",passed=0,pid="";
const notificationIds:string[]=[];
async function request(path:string,body?:unknown,expected=200,method=body===undefined?"GET":"POST") {
  const r=await fetch("http://localhost:80/api"+path,{method,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  if(r.headers.getSetCookie().some(c=>c.startsWith("mahalo_session=")))cookie=r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
  const text=await r.text();assert.equal(r.status,expected,`${method} ${path}: ${text.slice(0,200)}`);passed++;return JSON.parse(text);
}
async function patient(){return (await db.select().from(patients).where(eq(patients.id,pid)))[0]!;}
async function notification(audience="patient"){
  const r=await db.transaction(s=>addRecord(s,"notifications",{title:"Synthetic quiet-hours acceptance fixture",patientId:pid,status:"pending",metadata:{audience,channel:"email",testOnly:true,deliveredExternally:false}},systemActor));
  notificationIds.push(r.id);return r;
}
async function row(id:string){return (await db.select().from(records).where(eq(records.id,id)))[0]!;}
async function capture(id:string,at:Date){return db.transaction(async s=>captureNotificationOutbox(s,[await patient()],at,id));}
async function main(){
  try{
    await request("/auth/login",{email:"demo@mahalo.care",password:"MahaloDemo2026!"});
    pid=(await request("/patients",{firstName:"Synthetic",lastName:`Contact EHR ${randomUUID().slice(0,6)}`,dob:"1980-01-01",location:"Garden City",timezone:"UTC"},201)).id;
    const prefs={email:true,sms:true,push:true};
    await request("/actions",{action:"updatePreferences",patientId:pid,payload:{...prefs,quietHours:{enabled:true,start:"24:00",end:"08:00"}}},400);
    await request("/actions",{action:"updatePreferences",patientId:pid,payload:{...prefs,quietHours:{enabled:true,start:"08:00",end:"08:00"}}},400);
    await request(`/patients/${pid}`,{communicationPreferences:{...prefs,quietHours:{enabled:true,start:"08:00",end:"08:00"}}},400,"PATCH");
    await request("/actions",{action:"updatePreferences",patientId:pid,payload:{...prefs,quietHours:{enabled:true,start:"00:00",end:"23:59"}}});
    await request("/actions",{action:"updatePreferences",patientId:pid,payload:prefs});
    const saved=await request(`/patients/${pid}`);assert.equal(saved.patient.communicationPreferences.quietHours.enabled,true);
    const at=new Date(new Date().toISOString().slice(0,10)+"T12:00:00.000Z");
    const deferred=await notification();
    assert.equal((await capture(deferred.id,at)).deferred,1);
    const pending=await row(deferred.id);assert.equal(pending.status,"pending");assert.ok(pending.metadata.deferredUntil);
    assert.equal((await capture(deferred.id,at)).deferred,1);
    assert.equal((await row(deferred.id)).updatedAt.getTime(),pending.updatedAt.getTime(),"Retry must not repeatedly rewrite the same deferral");
    const allowed=new Date(String(pending.metadata.deferredUntil));
    assert.equal((await capture(deferred.id,allowed)).captured,1);
    assert.equal((await row(deferred.id)).metadata.deliveredExternally,false);
    await request("/actions",{action:"updatePreferences",patientId:pid,payload:{...prefs,email:false}});
    const optedOut=await notification();assert.equal((await capture(optedOut.id,at)).suppressed,1);assert.equal((await row(optedOut.id)).status,"suppressed");
    const staff=await notification("staff");assert.equal((await capture(staff.id,at)).captured,1);
    const sync=(payload:unknown={})=>request("/actions",{action:"syncEhr",patientId:pid,payload});
    const initial=(await sync()).record;assert.equal(initial.metadata.matchedBy,"mrn");assert.ok(initial.metadata.resources.length>0);
    const pendingMatch=(await sync({demonstrateManualMatch:true})).record;
    assert.equal(pendingMatch.status,"confirmation_required");assert.deepEqual(pendingMatch.metadata.resources,[]);
    const confirmation={confirmed:true,candidateId:pendingMatch.metadata.candidateIdentity.id,matchHash:pendingMatch.metadata.matchHash,reason:"Compared both synthetic identities and confirmed the same person."};
    await request("/actions",{action:"syncEhr",patientId:pid,payload:{confirmation:{...confirmation,confirmed:false}}},400);
    await request("/actions",{action:"syncEhr",patientId:pid,payload:{confirmation:{...confirmation,matchHash:"0".repeat(64)}}},409);
    await request("/actions",{action:"syncEhr",patientId:pid,payload:{confirmation:{...confirmation,candidateId:"fixture-another-patient"}}},409);
    await request("/actions",{action:"syncEhr",patientId:pid,payload:{confirmation:{...confirmation,confirmedById:"forged-reviewer"}}},400);
    const linked=(await sync({confirmation})).record;assert.equal(linked.status,"completed");assert.equal(linked.metadata.matchedBy,"confirmed_name_dob");
    assert.equal(linked.metadata.matchConfirmation.confirmedById,"demo-admin");assert.ok(linked.metadata.resources.length>0);
    const refreshed=(await sync()).record;assert.deepEqual(refreshed.metadata.matchConfirmation,linked.metadata.matchConfirmation);
    await request(`/records/interactions/${linked.id}`,{metadata:{kind:"ordinary"}},400,"PATCH");
    await request("/records/interactions",{title:"Forged source",patientId:pid,metadata:{kind:"ehr_sync",resources:[]}},400);
    await request(`/patients/${pid}`,{firstName:"Updated Synthetic"},200,"PATCH");
    await request("/actions",{action:"syncEhr",patientId:pid,payload:{confirmation}},409);
    const changed=(await sync()).record;assert.equal(changed.status,"confirmation_required");
    await sync({confirmation:{...confirmation,matchHash:changed.metadata.matchHash}});
    await request(`/patients/${pid}`,{dob:"1981-01-01"},200,"PATCH");
    const blocked=(await sync()).record;assert.equal(blocked.status,"match_blocked");assert.deepEqual(blocked.metadata.resources,[]);
    await request("/actions",{action:"syncEhr",patientId:pid,payload:{confirmation:{...confirmation,matchHash:blocked.metadata.matchHash}}},409);
    console.log(`Passed ${passed} HTTP checks plus notification deferral, idempotency, release, opt-out and staff-bypass database assertions.`);
  } finally{
    if(pid)await request(`/patients/${pid}`,{status:"inactive"},200,"PATCH").catch(()=>{});
    if(notificationIds.length)await db.update(records).set({status:"canceled"}).where(and(inArray(records.id,notificationIds),eq(records.status,"pending")));
    if(cookie)await request("/auth/logout",{}).catch(()=>{});
    await pool.end();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
