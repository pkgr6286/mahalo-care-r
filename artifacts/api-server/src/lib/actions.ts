import { eq, sql } from "drizzle-orm";
import { db, records, type RecordRow } from "@workspace/db";
import { allRecords, addRecord, patchRecord, getRecord, getPatientRow, now, type Actor, type Store } from "./store";
import { AppError } from "./errors";
import { intervalsOverlap } from "./billing-engine";
import { calculateBilling, closeBilling } from "./billing";
import { ingestReading, assertKind } from "./observations";
import { runRules } from "./rules";
import { importPatients } from "./import-patients";
import { generateLiveDraft, isLiveDraft } from "./ai-drafting";

export type Action = {
  action: string; id?: string; patientId?: string; program?: string;
  reason?: string; payload?: Record<string, unknown>;
};
function fail(message:string):never { throw new AppError(400,message); }
const reason = (a:Action) => a.reason?.trim() || fail("A reason is required for this action");

export async function performAction(actor:Actor,a:Action) {
  if(isLiveDraft(a)) {
    const r=await generateLiveDraft(actor,a);
    return {success:true,message:"AI draft saved for human review",record:r,records:undefined,url:undefined};
  }
  return db.transaction(async s => {
    // Demo-scale serialization prevents concurrent workflow transitions, timers and billing closes.
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    const payload=a.payload||{};
    const record=await dispatch(s,actor,a,payload);
    return {success:true,message:messages[a.action]||"Action completed",...record};
  });
}
const messages:Record<string,string>={
  enroll:"Enrollment activated, consent captured and draft care plan created",
  signPlan:"Care plan signed. A PDF is available.",signNote:"Note signed. The signed version is immutable.",
  resolve:"Exception resolved",commitTime:"Time committed",voidTime:"Time voided with an audit trail",
  calculateBilling:"Provisional billing evidence recalculated",closePeriod:"Current demo period closed and evidence frozen",
  reopenPeriod:"Period reopened with an audit trail",syncEhr:"Synthetic FHIR fixture refreshed — no live EHR connected",
  createVideo:"Video is simulated. No live room or communication evidence was created.",
  draftSummary:"Deterministic demo draft prepared for human review — no AI provider connected",
  testIntegration:"Synthetic adapter health check passed — live integration is not connected",
};

async function dispatch(s:Store,actor:Actor,a:Action,payload:Record<string,unknown>):Promise<{record?:RecordRow;records?:RecordRow[];url?:string}> {
  if(a.action==="importPatients") return {record:await importPatients(s,actor,payload)};
  if(["evaluateRules","testRule"].includes(a.action)) return {records:await runRules(s,actor,a)};
  if(a.action==="recordAdherence") {
    const p=await getPatientRow(s,a.patientId),kind=String(payload.kind||"");
    if(!["medication","exercise","education"].includes(kind)) fail("Choose a valid adherence activity");
    if(typeof payload.title!=="string"||!payload.title.trim()) fail("An activity title is required");
    const day=new Intl.DateTimeFormat("en-CA",{timeZone:p.timezone}).format(new Date());
    const prior=(await allRecords(s,"tasks")).find(r=>r.patientId===p.id&&r.metadata.adherenceKind===kind&&r.metadata.activityTitle===payload.title&&r.metadata.day===day);
    if(prior) return {record:prior};
    const status=payload.status==="skipped"?"skipped":"completed";
    return {record:await addRecord(s,"tasks",{title:String(payload.title),patientId:p.id,program:a.program,status,description:status==="skipped"?String(payload.barrier||"No reason recorded"):"Activity completion reported in the patient preview",metadata:{adherenceKind:kind,activityTitle:payload.title,day,completedAt:now(),source:"patient_reported",barrier:payload.barrier||null}},actor)};
  }
  if(a.action==="generateTasks") {
    await getPatientRow(s,a.patientId);
    const rs=await allRecords(s),plans=rs.filter(r=>r.kind==="careplans"&&r.patientId===a.patientId&&r.status==="active");
    const created=[];
    for(const plan of plans) {
      for(let day=0;day<14;day++) {
        const due=new Date();due.setUTCDate(due.getUTCDate()+day);due.setUTCHours(14,0,0,0);
        const key=`${plan.id}:${due.toISOString().slice(0,10)}`;
        if(rs.some(r=>r.kind==="tasks"&&r.metadata.scheduleKey===key)) continue;
        created.push(await addRecord(s,"tasks",{title:`Daily ${plan.program} check-in`,patientId:a.patientId,program:plan.program,status:"pending",date:due.toISOString(),metadata:{carePlanId:plan.id,scheduleKey:key,taskKind:"checkin"}},actor));
      }
    }
    return {records:created};
  }
  if(["draftNote","draftMessage","prioritizeQueue","suggestTime"].includes(a.action)) {
    const p=await getPatientRow(s,a.patientId);
    const descriptions:Record<string,string>={
      draftNote:`Reviewed ${p.firstName}'s recorded observations, care-plan progress and recent interactions. Confirm all statements against the source records before signing.`,
      draftMessage:"Thank you for checking in. Please continue following your agreed care plan. Contact your care team if you have questions.",
      prioritizeQueue:"Suggested order follows configured severity and age. This is a deterministic demonstration, not an independent clinical assessment.",
      suggestTime:"Review the completed interaction and enter the actual start and end times. No minutes are committed automatically.",
    };
    return {record:await addRecord(s,"drafts",{title:`${a.action} · simulated draft`,patientId:p.id,program:a.program,status:"pending",description:descriptions[a.action],metadata:{capability:a.action,provider:"deterministic_demo",reviewRequired:true,promptVersion:"demo.1"}},actor)};
  }
  if(a.action==="enroll") return {record:await enroll(s,actor,a,payload)};
  if(a.action==="simulateReading") {
    return {record:await ingestReading(s,{
      patientId:a.patientId,program:a.program||"RPM",title:"Blood pressure",
      value:Number(payload.systolic??142),unit:"mmHg",
      metadata:{diastolic:Number(payload.diastolic??86),source:"device",deviceCleared:true,simulated:true},
    },actor)};
  }
  if(a.action==="startTimer") {
    await getPatientRow(s,a.patientId);
    if(!a.program) fail("Select the program before starting a timer");
    const rs=await allRecords(s);
    if(rs.some(r=>r.kind==="time" && r.status==="running" && r.metadata.userId===actor.id)) throw new AppError(409,"You already have a running timer");
    if(!rs.some(r=>r.kind==="enrollments" && r.patientId===a.patientId && r.program===a.program && r.status==="active")) fail("An active enrollment is required");
    return {record:await addRecord(s,"time",{title:"Care activity",patientId:a.patientId,program:a.program,status:"running",unit:"min",metadata:{startedAt:now(),activity:String(payload.activity||"review_data"),source:"timer",userId:actor.id,credential:actor.credential}},actor)};
  }
  if(a.action==="commitTime" && !a.id) return {record:await commitTime(s,actor,a,payload)};
  if(a.action==="submitCheckin") return {record:await submitCheckin(s,actor,a,payload)};
  if(a.action==="calculateBilling") return {records:await calculateBilling(s,actor)};
  if(a.action==="closePeriod") return {records:await closeBilling(s,actor)};
  if(a.action==="reopenPeriod") {
    const why=reason(a), period=now().slice(0,7), lines=(await allRecords(s,"billing")).filter(r=>r.metadata.period===period);
    const reopened=[];
    for(const line of lines) reopened.push(await patchRecord(s,line,{status:line.metadata.met?"candidate":"blocked",metadata:{...line.metadata,closed:false,periodStatus:"open",reopenedAt:now(),reopenedBy:actor.name,reason:why,revision:Number(line.metadata.revision||0)+1}},actor,"reopen"));
    for(const t of await allRecords(s,"time")) if(t.metadata.period===period) await patchRecord(s,t,{metadata:{...t.metadata,locked:false}},actor,"unlock");
    return {records:reopened};
  }
  if(a.action==="draftSummary") {
    const p=await getPatientRow(s,a.patientId), rs=(await allRecords(s)).filter(r=>r.patientId===p.id);
    const readings=rs.filter(r=>r.kind==="observations" && r.metadata.valid!==false);
    const time=rs.filter(r=>r.kind==="time" && r.status==="committed").reduce((n,r)=>n+r.value,0);
    const open=rs.filter(r=>r.kind==="exceptions" && ["open","acknowledged"].includes(r.status));
    return {record:await addRecord(s,"drafts",{title:"Patient summary · demo draft",patientId:p.id,program:a.program,status:"pending",description:`${p.firstName} ${p.lastName} has ${readings.length} recorded observations, ${open.length} unresolved exceptions and ${time.toFixed(1)} minutes of documented care activity. Review the patient timeline, current care plan and source records before using this summary.`,metadata:{provider:"deterministic_demo",promptVersion:"demo.1",sourceIds:rs.map(r=>r.id),reviewRequired:true}},actor)};
  }
  if(a.action==="syncEhr") {
    const p=await getPatientRow(s,a.patientId);
    return {record:await addRecord(s,"interactions",{title:"FHIR R4 fixture sync",patientId:p.id,status:"completed",description:"Read-only synthetic EHR context refreshed. No live EHR request was made.",metadata:{source:"fhir_fixture",conditions:p.conditions,medications:p.medications,lastSync:now(),resourceTypes:["Patient","Condition","MedicationRequest","Observation"]}},actor)};
  }
  if(a.action==="createVideo") {
    await getPatientRow(s,a.patientId);
    return {record:await addRecord(s,"interactions",{title:"Simulated video request",patientId:a.patientId,status:"simulated",description:"Video provider is not connected. This does not count as a live interaction.",metadata:{kind:"video",isLiveTwoWay:false,driver:"stub"}},actor)};
  }
  if(a.action==="importConfiguration") return importConfiguration(s,actor,payload);
  const r=await getRecord(s,a.id);
  switch(a.action) {
    case "pauseEnrollment": assertKind(r,"enrollments");return {record:await patchRecord(s,r,{status:"paused"},actor,"pause")};
    case "discharge": {
      assertKind(r,"enrollments");const why=reason(a);
      for(const plan of await allRecords(s,"careplans")) if(plan.patientId===r.patientId && plan.program===r.program && plan.status==="active") await patchRecord(s,plan,{status:"closed",metadata:{...plan.metadata,closedReason:why}},actor,"close");
      return {record:await patchRecord(s,r,{status:"discharged",metadata:{...r.metadata,reason:why,endedAt:now()}},actor,"discharge")};
    }
    case "signPlan":
    case "signNote": {
      assertKind(r,a.action==="signPlan"?"careplans":"notes");
      if(r.status!=="draft") throw new AppError(409,"Only a draft can be signed");
      if(!r.description.trim()) fail("Document content is required before signing");
      if(a.action==="signPlan" && (!String(r.metadata.goals||"").trim()||!String(r.metadata.interventions||"").trim())) fail("Goals and interventions are required before signing a plan");
      if(a.action==="signPlan") {
        for(const prior of await allRecords(s,"careplans")) if(prior.patientId===r.patientId && prior.program===r.program && prior.status==="active") await patchRecord(s,prior,{status:"superseded"},actor,"supersede");
      }
      return {record:await patchRecord(s,r,{status:a.action==="signPlan"?"active":"signed",metadata:{...r.metadata,signedBy:actor.name,signedAt:now(),version:r.metadata.version||1}},actor,"sign"),url:`/api/documents/${r.id}`};
    }
    case "acknowledge":
      assertKind(r,"exceptions");if(r.status!=="open") fail("Only open exceptions can be acknowledged");
      return {record:await patchRecord(s,r,{status:"acknowledged",assignee:actor.name},actor,"acknowledge")};
    case "resolve":
    case "dismiss":
      assertKind(r,"exceptions");if(!["open","acknowledged"].includes(r.status)) fail("This exception has already been closed");
      return {record:await patchRecord(s,r,{status:a.action==="resolve"?"resolved":"dismissed",metadata:{...r.metadata,resolution:reason(a),resolvedBy:actor.name,resolvedAt:now()}},actor,a.action)};
    case "stopTimer":
    case "commitTime": {
      assertKind(r,"time");
      if(r.metadata.userId!==actor.id) throw new AppError(403,"You may only commit your own time");
      if(!["running","draft"].includes(r.status)) throw new AppError(409,"Time is already committed or voided");
      const startedAt=String(r.metadata.startedAt), endedAt=String(payload.endedAt||now());
      await validateTime(s,actor,startedAt,endedAt,r.id);
      if((await allRecords(s,"billing")).some(l=>l.metadata.period===startedAt.slice(0,7)&&l.metadata.closed===true)) throw new AppError(409,"Reopen the closed period before committing this timer");
      return {record:await patchRecord(s,r,{status:"committed",value:(Date.parse(endedAt)-Date.parse(startedAt))/60000,metadata:{...r.metadata,endedAt}},actor,"commit")};
    }
    case "voidTime":
      assertKind(r,"time");if(r.metadata.locked) throw new AppError(409,"Reopen the billing period before voiding locked time");
      return {record:await patchRecord(s,r,{status:"voided",metadata:{...r.metadata,voidReason:reason(a),voidedBy:actor.name}},actor,"void")};
    case "completeTask":
      assertKind(r,"tasks");
      return {record:await patchRecord(s,r,{status:"completed",metadata:{...r.metadata,completedAt:now()}},actor,"complete")};
    case "revokeConsent": {
      assertKind(r,"consents");const why=reason(a);
      for(const e of await allRecords(s,"enrollments")) if(e.patientId===r.patientId&&e.program===r.program&&e.status==="active") await patchRecord(s,e,{status:"paused",metadata:{...e.metadata,pauseReason:"Consent revoked"}},actor,"pause");
      return {record:await patchRecord(s,r,{status:"revoked",metadata:{...r.metadata,revokedAt:now(),reason:why}},actor,"revoke")};
    }
    case "approveLine":
    case "rejectLine":
      assertKind(r,"billing");
      if(a.action==="approveLine" && r.metadata.met!==true) fail("Unmet evidence requirements block approval");
      if(a.action==="approveLine" && r.status==="rejected") fail("Recalculate the open period before approving a rejected line");
      return {record:await patchRecord(s,r,{status:a.action==="approveLine"?"approved":"rejected",metadata:{...r.metadata,decidedBy:actor.name,decidedAt:now(),reason:a.action==="rejectLine"?reason(a):"Reviewed by billing staff"}},actor,a.action)};
    case "acceptDraft": {
      assertKind(r,"drafts");if(r.status!=="pending") throw new AppError(409,"Draft has already been reviewed");
      const accepted=await patchRecord(s,r,{status:"accepted",metadata:{...r.metadata,acceptedBy:actor.name,acceptedAt:now()}},actor,"accept");
      const capability=String(r.metadata.capability||"draftNote");
      if(capability==="draftMessage") await addRecord(s,"messages",{title:"Reviewed message draft",patientId:r.patientId,program:r.program,status:"sent",description:String(payload.finalText||r.description),metadata:{aiDraftId:r.id,direction:"outbound",sender:actor.name,channel:"secure"}},actor);
      else if(!["suggestTime","prioritizeQueue"].includes(capability)) await addRecord(s,"notes",{title:"Monthly summary from reviewed demo draft",patientId:r.patientId,program:r.program,status:"draft",description:String(payload.finalText||r.description),metadata:{aiDraftId:r.id,version:1}},actor);
      return {record:accepted};
    }
    case "rejectDraft":
      assertKind(r,"drafts");return {record:await patchRecord(s,r,{status:"rejected"},actor,"reject")};
    case "testIntegration":
      assertKind(r,"integrations");return {record:await patchRecord(s,r,{metadata:{...r.metadata,lastCheckedAt:now(),lastTestedAt:now(),health:"simulator_ok"}},actor,"test")};
    default: fail("Unsupported action");
  }
}

async function enroll(s:Store,actor:Actor,a:Action,payload:Record<string,unknown>) {
  const p=await getPatientRow(s,a.patientId), program=a.program?.toUpperCase();
  if(!program || !["RPM","RTM","CCM","PCM","BHI"].includes(program)) fail("Select a valid program");
  if(payload.consent!==true) fail("Program consent must be captured before activation");
  if(program==="CCM" && p.conditions.length<2) fail("CCM requires at least two documented chronic conditions");
  if(program==="PCM" && !p.conditions.length) fail("PCM requires a qualifying condition");
  const rs=await allRecords(s), active=rs.filter(r=>r.kind==="enrollments" && r.patientId===p.id && r.status==="active");
  if(active.some(r=>r.program===program)) throw new AppError(409,"Patient already has an active enrollment in this program");
  if(active.some(r=>(program==="RPM"&&r.program==="RTM")||(program==="RTM"&&r.program==="RPM"))) throw new AppError(409,"RPM and RTM cannot be active for the same patient in the same period");
  if(active.some(r=>(program==="CCM"&&r.program==="PCM")||(program==="PCM"&&r.program==="CCM"))) throw new AppError(409,"CCM and PCM require distinct practitioner review; demo conservatively blocks concurrent activation");
  const enrollment=await addRecord(s,"enrollments",{title:`${program} enrollment`,patientId:p.id,program,status:"active",metadata:{...payload,consent:true,rulepackVersion:"2026.demo",activatedBy:actor.name}},actor);
  await addRecord(s,"consents",{title:`${program} program consent`,patientId:p.id,program,status:"captured",description:"Synthetic demonstration consent",metadata:{method:"electronic",textVersion:"demo.1",capturedBy:actor.name,capturedAt:now(),enrollmentId:enrollment.id}},actor);
  await addRecord(s,"careplans",{title:`${program} care plan`,patientId:p.id,program,status:"draft",description:"",metadata:{version:1,reviewDays:30,enrollmentId:enrollment.id}},actor);
  return enrollment;
}

async function validateTime(s:Store,actor:Actor,start:string,end:string,exclude?:string) {
  const a=Date.parse(start),b=Date.parse(end);
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a) fail("Start and end must be valid, with end after start");
  if(b>Date.now()+300000) fail("Time cannot be committed in the future");
  if(b-a>12*3600000) fail("A time entry cannot exceed 12 hours");
  const other=(await allRecords(s,"time")).filter(r=>r.id!==exclude && r.status==="committed" && r.metadata.userId===actor.id);
  if(other.some(r=>intervalsOverlap(start,end,String(r.metadata.startedAt),String(r.metadata.endedAt)))) throw new AppError(409,"This interval overlaps committed time. A minute can belong to only one program.");
}
async function commitTime(s:Store,actor:Actor,a:Action,payload:Record<string,unknown>) {
  await getPatientRow(s,a.patientId);
  if(!a.program) fail("Choose the program for this time entry");
  const rs=await allRecords(s);
  if(!rs.some(r=>r.kind==="enrollments" && r.patientId===a.patientId && r.program===a.program && r.status==="active")) fail("Time requires an active program enrollment");
  const start=String(payload.startedAt||""),end=String(payload.endedAt||"");
  await validateTime(s,actor,start,end);
  if(rs.some(r=>r.kind==="billing" && r.metadata.period===start.slice(0,7) && r.metadata.closed===true)) throw new AppError(409,"This period is closed");
  return addRecord(s,"time",{title:String(payload.activity||"Care coordination"),patientId:a.patientId,program:a.program,status:"committed",date:start,value:(Date.parse(end)-Date.parse(start))/60000,unit:"min",metadata:{startedAt:start,endedAt:end,activity:String(payload.activity||"care_coordination"),source:"manual",userId:actor.id,credential:actor.credential,reason:a.reason||null}},actor);
}
async function submitCheckin(s:Store,actor:Actor,a:Action,payload:Record<string,unknown>) {
  await getPatientRow(s,a.patientId);
  const instrument=String(payload.instrument||"pain_nrs");
  const lengths:Record<string,number>={phq9:9,gad7:7,pain_nrs:1,odi:10,pgic:1};
  const answers=payload.answers;
  if(!lengths[instrument] || !Array.isArray(answers) || answers.length!==lengths[instrument] || answers.some(v=>typeof v!=="number" || !Number.isInteger(v) || v<(instrument==="pgic"?1:0) || v>(instrument==="pain_nrs"?10:instrument==="odi"?5:instrument==="pgic"?7:3))) fail("Answers do not match the instrument's required range and question count");
  const numeric=answers as number[], score=instrument==="odi"?numeric.reduce((n,v)=>n+v,0)*2:numeric.reduce((n,v)=>n+v,0);
  const response=await addRecord(s,"responses",{title:`${instrument.toUpperCase()} check-in`,patientId:a.patientId,program:a.program,status:"completed",value:score,unit:"score",metadata:{instrument,answers:numeric,source:"patient_reported",band:score>=15?"high":score>=10?"moderate":"low"}},actor);
  if((instrument==="phq9"&&numeric[8]!>0) || (instrument==="pain_nrs"&&score>=8)) {
    await addRecord(s,"exceptions",{title:instrument==="phq9"?"Behavioral-health check-in requires immediate review":"High pain score reported",patientId:a.patientId,program:a.program,status:"open",severity:instrument==="phq9"?"critical":"high",description:"Follow the practice's clinician-approved escalation procedure.",metadata:{responseId:response.id,ruleKey:`score_${instrument}`}},actor);
  }
  return response;
}
async function importConfiguration(s:Store,actor:Actor,payload:Record<string,unknown>) {
  const allowed=["programs","templates","rules","locations","education","instruments"];
  if(!Array.isArray(payload.records)||payload.records.length>500) fail("Configuration must contain no more than 500 records");
  const imported:RecordRow[]=[];
  for(const raw of payload.records as Record<string,unknown>[]) {
    if(!allowed.includes(String(raw.kind)) || raw.patientId) fail("Configuration can contain only approved non-patient reference records");
    if(typeof raw.title!=="string"||!raw.title.trim()) fail("Every configuration record needs a title");
    imported.push(await addRecord(s,String(raw.kind),{title:raw.title,status:"active",description:String(raw.description||""),program:typeof raw.program==="string"?raw.program:null,metadata:raw.metadata&&typeof raw.metadata==="object"?raw.metadata as Record<string,unknown>:{}},actor));
  }
  return {records:imported};
}
