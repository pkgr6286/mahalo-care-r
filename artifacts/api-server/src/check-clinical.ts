import "./validation-fetch";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pool } from "@workspace/db";
import { digest } from "./lib/account-security";

const base="http://localhost:80/api";
let cookie="",passed=0;
async function call(path:string,body?:unknown,expected=200,method?:string) {
  const r=await fetch(base+path,{method:method??(body?"POST":"GET"),headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  assert.equal(r.status,expected,`${path}: ${await r.clone().text()}`);
  if(path==="/auth/login"&&r.ok)cookie=r.headers.get("set-cookie")!.split(";")[0]!;
  passed++;return r;
}
async function json(path:string,body?:unknown,expected=200,method?:string):Promise<any> {return (await call(path,body,expected,method)).json();}
async function run() {
  await call("/patients/no-such-patient/clinical-profile",undefined,401);
  const root=await json("/auth/login",{email:"demo@mahalo.care",password:"MahaloDemo2026!"});
  const status=await json("/operations/demonstration-status");
  assert.equal(status.prepared,true);assert.equal(status.documentsPending,false);assert.ok(status.patients>=30);
  const patient=await json("/patients",{firstName:"Clinical",lastName:`Verification ${Date.now()}`,dob:"1957-04-12",location:"Garden City",conditions:[],medications:[]},201);
  const path=`/patients/${patient.id}/clinical-profile`;
  const original=await json(path);assert.equal(original.conditions.length,0);
  const data={
    expectedUpdatedAt:original.updatedAt,
    conditions:[{code:"I10",codeSystem:"ICD-10-CM",display:"Essential hypertension",clinicalStatus:"active",chronic:true,onsetDate:"2021-03-12",source:"Clinical review"}],
    medications:[{name:"Amlodipine",dose:"5 mg",route:"oral",frequency:"once daily",indication:"Hypertension",status:"active",startedOn:"2024-01-12"}],
    coverage:[{payer:"Medicare",plan:"Original Medicare",memberId:"SYNTHETIC-VERIFICATION",effectiveFrom:"2026-01-01",status:"active"}],
    contacts:[{name:"Jamie Verification",relationship:"Daughter",phone:"(516) 555-0199",email:"jamie@example.test",emergency:true,sharingAllowed:false,sharingScope:[]}],
    identifiers:[{system:"Practice",value:`VERIFICATION-${Date.now()}`,source:"Practice registration"}],
  };
  const saved=await json(path,data,200,"PATCH");
  assert.equal(saved.conditions.length,1);assert.equal(saved.medications.length,1);assert.equal(saved.contacts[0].sharingAllowed,false);
  assert.equal(saved.medications[0].reconciledBy,root.name);
  const persisted=await pool.query("SELECT count(*)::int AS n FROM care_patient_conditions WHERE patient_id=$1",[patient.id]);
  assert.equal(persisted.rows[0].n,1);
  const chart=await json(`/patients/${patient.id}`);assert.deepEqual(chart.patient.conditions,["Essential hypertension"]);
  await call(path,data,409,"PATCH");
  await call(path,{expectedUpdatedAt:saved.updatedAt,conditions:[{...data.conditions[0],onsetDate:"2026-02-31"}]},400,"PATCH");
  await call(path,{expectedUpdatedAt:saved.updatedAt,contacts:[{...data.contacts[0],sharingAllowed:true,sharingScope:["careplans"]}]},400,"PATCH");
  const again=await json(path);assert.equal(again.updatedAt,saved.updatedAt,"Rejected writes must not alter the profile token");
  await json(path,{expectedUpdatedAt:again.updatedAt,coverage:[]},200,"PATCH");
  assert.equal((await json(`/patients/${patient.id}`)).patient.payer,"","Removing active coverage must not leave a stale primary payer");
  const core=(await json("/patients")).find((p:any)=>p.mrn==="MC-1001");
  const key=`routine_${Date.now()}`;
  const authored=await json("/records/instruments",{title:"Care-plan routine confidence",description:"Synthetic authoring verification.",program:"RPM",status:"draft",metadata:{key,questions:["How confident are you following the agreed morning routine?","How confident are you preparing questions for the next care-team conversation?"],range:{min:0,max:4},scoring:{method:"mean",bands:[{min:0,max:1.49,label:"Needs support"},{min:1.5,max:2.99,label:"Building routine"},{min:3,max:4,label:"Confident"}]},instructions:"Think about the last seven days.",answerLabels:["Not confident","A little","Somewhat","Mostly","Very confident"],language:"en",nonValidatedDemo:true,sourceRef:"Original synthetic authoring verification",licenseNote:"Original locally authored demonstration prompts; not a validated clinical questionnaire."}},201);
  const collect={action:"submitCheckin",patientId:core.id,program:"RPM",payload:{instrument:key,instrumentId:authored.id,answers:[1,3]}};
  await json("/actions",collect,400);
  await json(`/records/instruments/${authored.id}`,{status:"active",metadata:{contentApprovedForUse:true}},200,"PATCH");
  await json("/actions",collect);
  const response=(await json(`/records/responses?patientId=${core.id}`)).find((r:any)=>r.metadata.instrumentId===authored.id);
  assert.equal(response.value,2);assert.equal(response.metadata.band,"Building routine");
  assert.equal(response.metadata.instrumentSnapshot.instructions,"Think about the last seven days.");
  assert.deepEqual(response.metadata.instrumentSnapshot.answerLabels,["Not confident","A little","Somewhat","Mostly","Very confident"]);
  await json(`/records/instruments/${authored.id}`,{metadata:{instructions:"Changed recall period requires a new review."}},200,"PATCH");
  await json("/actions",collect,409);
  const other=await json("/patients",{firstName:"Other",lastName:`Verification ${Date.now()}`,dob:"1958-01-12",location:"Garden City"},201);
  const otherProfile=await json(`/patients/${other.id}/clinical-profile`);
  await call(`/patients/${other.id}/clinical-profile`,{expectedUpdatedAt:otherProfile.updatedAt,conditions:[saved.conditions[0]]},400,"PATCH");
  const zip=Buffer.from(await (await call(`/patients/${patient.id}/access-export`)).arrayBuffer());
  assert.equal(zip.subarray(0,2).toString(),"PK");
  const inspection=spawnSync("python3",["-c","import sys,zipfile,io,json,hashlib; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));m=json.loads(z.read('manifest.json'));p=json.loads(z.read('patient-record.json'));assert all(hashlib.sha256(z.read(f['name'])).hexdigest()==f['sha256'] for f in m['files']); print(json.dumps({'patient':p['patient']['id'],'files':len(m['files'])}))"],{input:zip,encoding:"utf8"});
  assert.equal(inspection.status,0,inspection.stderr);assert.equal(JSON.parse(inspection.stdout).patient,patient.id);
  const roster=await json("/patients"),margaret=roster.find((p:{mrn:string})=>p.mrn==="MC-1001");
  const progress=await json(`/patients/${margaret.id}/program-progress`);
  assert.ok(progress.length>=2);assert.ok(progress.every((p:{minuteTarget:number;minutes:number})=>p.minuteTarget>0&&p.minutes>=0));
  const rpm=progress.find((p:{program:string})=>p.program==="RPM");assert.ok(rpm.deviceDays>0);assert.notEqual(rpm.windowStart,rpm.periodLabel+"-01","Monitoring supply uses its actual rolling window");
  const token=cookie.slice(cookie.indexOf("=")+1);
  await pool.query("UPDATE care_sessions SET last_seen_at=now()-interval '17 minutes' WHERE token_hash=$1",[digest(token)]);
  const locked=await json("/auth/me");assert.equal(locked.sessionLocked,true);
  const blocked=await json(path,undefined,423);assert.equal(blocked.code,"SESSION_LOCKED");
  await call("/auth/activity",{},423);
  await call("/auth/unlock",{password:"IncorrectVerificationPassword"},401);
  await json("/auth/unlock",{password:"MahaloDemo2026!"});
  assert.equal((await json("/auth/me")).sessionLocked,false);await json(path);
  await json("/auth/logout",{});
  await json("/auth/login",{email:"patient@mahalo.care",password:"MahaloDemo2026!"});
  await call(path,undefined,403);await call(`/patients/${patient.id}/access-export`,undefined,403);
  await json("/auth/logout",{});
  console.log(JSON.stringify({passed,status:"passed",scope:"Structured clinical persistence, concurrency, permissions, bounded ZIP integrity, real progress, server-enforced idle lock"}));
}
run().catch(error=>{console.error(String(error));process.exitCode=1;}).finally(()=>pool.end());
