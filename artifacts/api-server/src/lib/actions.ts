import { eq, sql } from "drizzle-orm";
import { db, records, patients, type RecordRow } from "@workspace/db";
import { allRecords, addRecord, patchRecord, getRecord, getPatientRow, now, type Actor, type Store } from "./store";
import { AppError } from "./errors";
import { intervalsOverlap } from "./billing-engine";
import { calculateBilling, closeBilling } from "./billing";
import { ingestReading, assertKind } from "./observations";
import { runRules } from "./rules";
import {resolutionCodes} from "./clinical-rule-schema";
import { importPatients } from "./import-patients";
import { generateLiveDraft, isLiveDraft } from "./ai-drafting";
import { materializeTasks, planItems } from "./task-schedules";
import { enqueueJob } from "./job-store";
import { assertPlanForSigning } from "./careplan-validation";
import { validatePeriod } from "./billing";
import { localDay } from "./periods";
import {syncFixtureEhr} from "./ehr-sync";
import {communicationPreferencesSchema} from "./communication-preferences";
import { z } from "zod";
import {policyCatalog,selectRulepack,choosePublished} from "./program-policies";
import {CareplanTemplateSchema,visitWithinCalendarMonths} from "./program-policy-schema";
import {assertNoteForSigning} from "./note-templates";
import {captureWorkflowDocuments} from "./document-workflows";
import {buildNumericEvidence,assessNumericText} from "./ai-quality";
import {reviewAiDraft} from "./ai-review";
import {resolveTimeReminder} from "./time-reminders";
import {acknowledgeEducation} from "./education";
import {importConfiguration} from "./configuration";
import {instrumentContentHash} from "./content-review";

export type Action = {
  action: string; id?: string; patientId?: string; program?: string;
  reason?: string; payload?: Record<string, unknown>;
};
function fail(message:string):never { throw new AppError(400,message); }
const reason = (a:Action) => a.reason?.trim() || fail("A reason is required for this action");

export async function performAction(actor:Actor,a:Action) {
  if(["closePeriod","reopenPeriod"].includes(a.action)&&actor.locationScopes?.length)throw new AppError(403,"Practice-wide period closure or reopening requires billing access to all locations");
  if(isLiveDraft(a)) {
    const r=await generateLiveDraft(actor,a);
    return {success:true,message:"AI draft saved for human review",record:r,records:undefined,url:undefined};
  }
  return db.transaction(async s => {
    // Demo-scale serialization prevents concurrent workflow transitions, timers and billing closes.
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    if(a.id) {
      const [current]=await s.select({updatedAt:records.updatedAt}).from(records).where(eq(records.id,a.id)).for("update");
      if(["signPlan","signNote"].includes(a.action)&&a.payload?.expectedUpdatedAt!==undefined) {
        const expected=z.string().datetime({offset:true}).parse(a.payload.expectedUpdatedAt);
        if(current&&Date.parse(expected)!==current.updatedAt.getTime()) throw new AppError(409,"This document changed after it was reviewed. Refresh and review the latest version before signing.");
      }
    }
    const payload=a.payload||{};
    const record=await dispatch(s,actor,a,payload);
    if(record.record?.kind==="time")await resolveTimeReminder(s,actor,record.record);
    await captureWorkflowDocuments(s,actor,a.action,record);
    const patientId=a.patientId??record.record?.patientId;
    if(patientId&&!["testRule","evaluateRules"].includes(a.action)) await enqueueJob(s,"patient_rules",`event:${record.record?.id??patientId}:${a.action}:${Date.now()}`,{patientId});
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
  if(a.action==="recordConsultantReview") {
    if(!["admin","clinical_admin","billing_provider","psychiatric_consultant"].includes(actor.role)||!["MD","DO","NP","PA","psych_consultant"].includes(actor.credential)) throw new AppError(403,"A qualified consultant or provider must record this clinical review");
    if(!a.patientId) fail("Select a patient for the consultant review");
    const p=await getPatientRow(s,a.patientId!);
    if(p.status!=="active") throw new AppError(409,"Consultant reviews require an active patient");
    const enrollment=(await allRecords(s,"enrollments")).find(r=>r.patientId===p.id&&r.program==="BHI"&&r.status==="active"&&r.metadata.cocm===true);
    if(!enrollment) throw new AppError(409,"An active CoCM enrollment is required");
    const input=z.object({summary:z.string().trim().min(20).max(12000),nextReviewDays:z.number().int().min(1).max(90),assessmentCompleted:z.boolean().optional()}).parse(payload);
    const reviewedAt=new Date().toISOString(),nextReviewAt=new Date(Date.now()+input.nextReviewDays*86400000).toISOString();
    await patchRecord(s,enrollment,{metadata:{...enrollment.metadata,...(!enrollment.metadata.consultant?{consultant:actor.name,consultantUserId:actor.id,consultantAssignedAt:reviewedAt}:{}),...(input.assessmentCompleted===true?{assessment:true,assessedAt:reviewedAt,assessedById:actor.id}:{})}},actor,"record_cocm_review_attestations");
    return {record:await addRecord(s,"interactions",{patientId:p.id,program:"BHI",title:"Psychiatric consultant case review",status:"completed",description:input.summary,metadata:{kind:"consultant_review",enrollmentId:enrollment.id,reviewedAt,nextReviewAt,nextReviewDays:input.nextReviewDays,assessmentCompleted:input.assessmentCompleted===true,reviewedById:actor.id,reviewedBy:actor.name,reviewerRole:actor.role,reviewerCredential:actor.credential,attestation:"Human-entered consultant case review",provisional:true}},actor)};
  }
  if(a.action==="updatePreferences") {
    const p=await getPatientRow(s,a.patientId);
    const preferences={...p.communicationPreferences,...communicationPreferencesSchema.parse(payload)};
    await s.update(patients).set({communicationPreferences:preferences,updatedAt:new Date()}).where(eq(patients.id,p.id));
    await (await import("./store")).writeAudit(s,actor,"update_communication_preferences",p.id,p.id,{channels:preferences});
    return {};
  }
  if(a.action==="importPatients") return {record:await importPatients(s,actor,payload)};
  if(["evaluateRules","testRule"].includes(a.action)) return {records:await runRules(s,actor,a)};
  if(a.action==="recordAdherence") {
    const p=await getPatientRow(s,a.patientId),kind=String(payload.kind||""),program=await activeMonitoringProgram(s,p.id,a.program);
    if(!["medication","exercise","education"].includes(kind)) fail("Choose a valid adherence activity");
    if(typeof payload.title!=="string"||!payload.title.trim()) fail("An activity title is required");
    const day=new Intl.DateTimeFormat("en-CA",{timeZone:p.timezone}).format(new Date());
    const prior=(await allRecords(s,"tasks")).find(r=>r.patientId===p.id&&r.metadata.adherenceKind===kind&&r.metadata.activityTitle===payload.title&&r.metadata.day===day);
    if(prior) return {record:prior};
    const status=payload.status==="skipped"?"skipped":"completed";
    if(status==="skipped"&&(typeof payload.barrier!=="string"||payload.barrier.trim().length<3)) fail("Record a reason for skipping this activity");
    const barrierCode=String(payload.barrierCode??payload.barrier??"").trim().toLowerCase().replaceAll(" ","_");
    const knownBarriers=["too_painful","side_effects","forgot","unavailable","other"];
    if(payload.barrierCode&&!knownBarriers.includes(barrierCode)) fail("Choose a supported barrier code");
    return {record:await addRecord(s,"tasks",{title:String(payload.title),patientId:p.id,program,status,description:status==="skipped"?String(payload.barrier):"Activity completion reported by the patient",metadata:{adherenceKind:kind,activityTitle:payload.title,day,completedAt:now(),source:"patient_reported",barrier:payload.barrier||null,barrierCode:status==="skipped"?(knownBarriers.includes(barrierCode)?barrierCode:"other"):null}},actor)};
  }
  if(a.action==="generateTasks") {
    if(!a.patientId) fail("Choose a patient");
    return {records:await materializeTasks(s,actor,a.patientId)};
  }
  if(["draftNote","draftMessage","prioritizeQueue","suggestTime"].includes(a.action)) {
    const p=await getPatientRow(s,a.patientId);
    const descriptions:Record<string,string>={
      draftNote:`Reviewed ${p.firstName}'s recorded observations, care-plan progress and recent interactions. Confirm all statements against the source records before signing.`,
      draftMessage:"Thank you for checking in. Please continue following your agreed care plan. Contact your care team if you have questions.",
      prioritizeQueue:"Suggested order follows configured severity and age. This is a deterministic demonstration, not an independent clinical assessment.",
      suggestTime:"Review the completed interaction and enter the actual start and end times. No minutes are committed automatically.",
    };
    const sources=(await allRecords(s)).filter(row=>row.patientId===p.id),numericEvidence=buildNumericEvidence(sources,p.medications);
    return {record:await addRecord(s,"drafts",{title:`${a.action} · simulated draft`,patientId:p.id,program:a.program,status:"pending",description:descriptions[a.action],metadata:{capability:a.action,provider:"deterministic_demo",reviewRequired:true,promptVersion:"demo.2",sourceIds:sources.map(row=>row.id),numericEvidence,numericCheck:assessNumericText(descriptions[a.action],numericEvidence),reviewWarnings:["Deterministic synthetic example; verify all content before use. Source quantity checks are not clinical validation."]}},actor)};
  }
  if(a.action==="enroll") return {record:await enroll(s,actor,a,payload)};
  if(a.action==="simulateReading") {
    return {record:await ingestReading(s,{
      patientId:a.patientId,program:a.program||"RPM",title:"Blood pressure",
      value:Number(payload.systolic??142),unit:"mmHg",
      metadata:{diastolic:Number(payload.diastolic??86),source:"device",deviceCleared:true,simulated:true},
    },actor,true)};
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
  if(a.action==="acknowledgeEducation") {
    await getPatientRow(s,a.patientId);
    await activeMonitoringProgram(s,a.patientId!,a.program);
    return {record:await acknowledgeEducation(s,actor,a.patientId!,a.id!,payload)};
  }
  if(a.action==="calculateBilling") return {records:await calculateBilling(s,actor,validatePeriod(payload.period))};
  if(a.action==="closePeriod") return {records:await closeBilling(s,actor,validatePeriod(payload.period))};
  if(a.action==="bulkApproveLines") {
    if(!Array.isArray(payload.ids)||!payload.ids.length||payload.ids.length>100||payload.ids.some(x=>typeof x!=="string")) fail("Select between 1 and 100 evidence lines");
    const selected=await Promise.all([...new Set(payload.ids as string[])].map(lineId=>getRecord(s,lineId,"billing")));
    if(selected.some(r=>r.metadata.met!==true||r.status!=="candidate")) fail("Every selected line must be an eligible candidate");
    if(selected.some(r=>r.metadata.closed!==true)) throw new AppError(409,"Close the period to freeze evidence before approving lines");
    const changed=[];
    for(const line of selected) changed.push(await patchRecord(s,line,{status:"approved",metadata:{...line.metadata,decidedBy:actor.name,decidedAt:now(),reason:"Bulk review confirmed by billing staff"}},actor,"approveLine"));
    return {records:changed};
  }
  if(a.action==="reopenPeriod") {
    const why=reason(a), period=validatePeriod(payload.period), lines=(await allRecords(s,"billing")).filter(r=>r.metadata.period===period);
    const reopened=[];
    for(const line of lines) reopened.push(await patchRecord(s,line,{status:line.metadata.met?"candidate":"blocked",metadata:{...line.metadata,closed:false,periodStatus:"open",reopenedAt:now(),reopenedBy:actor.name,reason:why,revision:Number(line.metadata.revision||0)+1}},actor,"reopen"));
    for(const t of await allRecords(s,"time")) if(t.metadata.period===period) await patchRecord(s,t,{metadata:{...t.metadata,locked:false}},actor,"unlock");
    return {records:reopened};
  }
  if(a.action==="reviewPlan") {
    const plan=await getRecord(s,a.id,"careplans");
    if(plan.status!=="active") fail("Only the active signed plan can be reviewed");
    const summary=String(payload.summary??"").trim();if(!summary) fail("Review summary is required");
    let time:RecordRow|undefined;
    if(payload.startedAt||payload.endedAt) time=await commitTime(s,actor,{action:"commitTime",patientId:plan.patientId!,program:plan.program!,reason:summary},{startedAt:payload.startedAt,endedAt:payload.endedAt,activity:"care_plan_update"});
    const review=await addRecord(s,"interactions",{title:`${plan.program} care-plan review`,patientId:plan.patientId,program:plan.program,status:"completed",description:summary,metadata:{kind:"care_plan_review",carePlanId:plan.id,reviewedBy:actor.name,isLiveTwoWay:false,timeEntryId:time?.id??null}},actor);
    for(const task of await allRecords(s,"tasks")) if(task.metadata.carePlanId===plan.id&&task.metadata.taskKind==="care_plan_review"&&task.status==="pending") await patchRecord(s,task,{status:"completed",metadata:{...task.metadata,completedAt:now(),reviewId:review.id}},actor,"complete");
    return {record:review};
  }
  if(a.action==="draftSummary") {
    const p=await getPatientRow(s,a.patientId), rs=(await allRecords(s)).filter(r=>r.patientId===p.id);
    const readings=rs.filter(r=>r.kind==="observations" && r.metadata.valid!==false);
    const time=rs.filter(r=>r.kind==="time" && r.status==="committed").reduce((n,r)=>n+r.value,0);
    const open=rs.filter(r=>r.kind==="exceptions" && ["open","acknowledged"].includes(r.status));
    const description=`${p.firstName} ${p.lastName} has ${readings.length} valid observations, ${open.length} unresolved exceptions and ${time.toFixed(2)} minutes of documented care activity. Review the patient timeline, current care plan and source records before using this summary.`,numericEvidence=buildNumericEvidence(rs,p.medications);
    return {record:await addRecord(s,"drafts",{title:"Patient summary · demo draft",patientId:p.id,program:a.program,status:"pending",description,metadata:{capability:a.action,provider:"deterministic_demo",promptVersion:"demo.2",sourceIds:rs.map(r=>r.id),numericEvidence,numericCheck:assessNumericText(description,numericEvidence),reviewRequired:true,reviewWarnings:["Synthetic deterministic summary; human review is required."]}},actor)};
  }
  if(a.action==="syncEhr") {
    return syncFixtureEhr(s,actor,a.patientId,payload);
  }
  if(a.action==="createVideo") {
    await getPatientRow(s,a.patientId);
    return {record:await addRecord(s,"interactions",{title:"Simulated video request",patientId:a.patientId,status:"simulated",description:"Video provider is not connected. This does not count as a live interaction.",metadata:{kind:"video",isLiveTwoWay:false,driver:"stub"}},actor)};
  }
  if(a.action==="importConfiguration") return importConfiguration(s,actor,payload);
  const r=await getRecord(s,a.id);
  switch(a.action) {
    case "discardDraft":
    case "restoreDraft": {
      if(!["notes","careplans"].includes(r.kind)) fail("Only clinical document drafts support this workflow");
      const discard=a.action==="discardDraft";
      if(discard?r.status!=="draft":r.status!=="cancelled"||!r.metadata.draftDiscardedAt) throw new AppError(409,discard?"Only an unsigned draft can be discarded":"Only a previously discarded draft can be restored");
      const why=z.string().trim().min(5).max(2000).parse(a.reason);
      return {record:await patchRecord(s,r,{status:discard?"cancelled":"draft",metadata:{...r.metadata,...(discard?{draftDiscardedAt:now(),draftDiscardedById:actor.id,draftDiscardReason:why}:{draftRestoredAt:now(),draftRestoredById:actor.id,draftRestoreReason:why})}},actor,a.action)};
    }
    case "pauseEnrollment": assertKind(r,"enrollments");return {record:await patchRecord(s,r,{status:"paused"},actor,"pause")};
    case "discharge": {
      assertKind(r,"enrollments");const why=reason(a);
      for(const plan of await allRecords(s,"careplans")) if(plan.patientId===r.patientId && plan.program===r.program && plan.status==="active") await patchRecord(s,plan,{status:"closed",metadata:{...plan.metadata,closedReason:why,closedAt:now()}},actor,"close");
      for(const task of await allRecords(s,"tasks")) if(task.patientId===r.patientId&&task.program===r.program&&task.status==="pending") await patchRecord(s,task,{status:"cancelled",metadata:{...task.metadata,closedReason:why}},actor,"cancel");
      return {record:await patchRecord(s,r,{status:"discharged",metadata:{...r.metadata,reason:why,endedAt:now()}},actor,"discharge")};
    }
    case "signPlan":
    case "signNote": {
      assertKind(r,a.action==="signPlan"?"careplans":"notes");
      if(r.status!=="draft") throw new AppError(409,"Only a draft can be signed");
      if(!r.description.trim()) fail("Document content is required before signing");
      let version=1;
      if(r.metadata.priorVersionId) {
        const prior=await getRecord(s,String(r.metadata.priorVersionId),r.kind);
        if(prior.patientId!==r.patientId||prior.program!==r.program) fail("A document revision must have the same patient and program as its signed predecessor");
        const previous=Number(prior.metadata.version??1);
        if(!Number.isSafeInteger(previous)||previous<1) fail("The prior document has an invalid revision number");
        version=previous+1;
        if(a.action==="signPlan"&&prior.status!=="active") throw new AppError(409,"This care plan is no longer the current active revision. Review the latest plan or create a fresh episode plan.");
        if(a.action==="signNote"&&(!["signed","amended","superseded"].includes(prior.status)||(await allRecords(s,"notes")).some(n=>n.id!==r.id&&n.metadata.priorVersionId===prior.id&&["signed","amended","superseded"].includes(n.status)))) throw new AppError(409,"A newer signed note revision already exists. Review the latest signed revision before adding another amendment.");
      }
      if(a.action==="signNote") await assertNoteForSigning(s,r);
      if(a.action==="signPlan") {
        const p=await getPatientRow(s,r.patientId!);assertPlanForSigning(r,p);
        if(Number(r.metadata.schemaVersion??1)>=2&&r.program==="RPM"&&!(await allRecords(s,"devices")).some(d=>d.patientId===r.patientId&&d.program==="RPM"&&["assigned","active"].includes(d.status))) fail("Assign an RPM device before signing this plan");
        planItems(r);
        for(const prior of await allRecords(s,"careplans")) if(prior.patientId===r.patientId && prior.program===r.program && prior.status==="active") {
          await patchRecord(s,prior,{status:"superseded",metadata:{...prior.metadata,supersededAt:now()}},actor,"supersede");
          for(const task of await allRecords(s,"tasks")) if(task.metadata.carePlanId===prior.id&&task.status==="pending") await patchRecord(s,task,{status:"cancelled",metadata:{...task.metadata,cancelReason:"Superseded by a newly signed plan",newPlanId:r.id}},actor,"cancel");
        }
      }
      const signed=await patchRecord(s,r,{status:a.action==="signPlan"?"active":"signed",metadata:{...r.metadata,signedBy:actor.name,signedById:actor.id,signerRole:actor.role,signerCredential:actor.credential,signedAt:now(),version}},actor,"sign");
      if(a.action==="signPlan") await materializeTasks(s,actor,r.patientId!);
      return {record:signed,url:`/api/documents/${r.id}`};
    }
    case "acknowledge":
      assertKind(r,"exceptions");if(r.status!=="open") fail("Only open exceptions can be acknowledged");
      return {record:await patchRecord(s,r,{status:"acknowledged",assignee:actor.name,metadata:{...r.metadata,ownerUserId:actor.id,ownerRole:actor.role,assignmentSource:"claimed",acknowledgedById:actor.id,acknowledgedAt:now()}},actor,"acknowledge")};
    case "resolve":
    case "dismiss":
      assertKind(r,"exceptions");if(!["open","acknowledged"].includes(r.status)) fail("This exception has already been closed");
      if((a.reason?.trim().length??0)<5) fail("Enter a resolution reason of at least five characters");
      if(!resolutionCodes.includes(payload.resolutionCode as typeof resolutionCodes[number])) fail("Choose a supported exception resolution code");
      if(payload.linkedNoteId) {
        const note=await getRecord(s,String(payload.linkedNoteId),"notes");
        if(note.patientId!==r.patientId||note.status!=="signed") fail("A linked resolution note must be a signed note from this patient's chart");
      }
      return {record:await patchRecord(s,r,{status:a.action==="resolve"?"resolved":"dismissed",metadata:{...r.metadata,resolution:reason(a),resolutionCode:payload.resolutionCode,linkedNoteId:payload.linkedNoteId??null,resolvedBy:actor.name,resolvedById:actor.id,resolvedAt:now()}},actor,a.action)};
    case "stopTimer":
    case "commitTime": {
      assertKind(r,"time");
      if(r.metadata.userId!==actor.id) throw new AppError(403,"You may only commit your own time");
      if(!["running","draft"].includes(r.status)) throw new AppError(409,"Time is already committed or voided");
      const startedAt=String(r.metadata.startedAt), endedAt=String(payload.endedAt||(r.status==="draft"?r.metadata.endedAt??r.updatedAt.toISOString():now()));
      await validateTime(s,actor,startedAt,endedAt,r.id);
      const p=await getPatientRow(s,r.patientId!);
      if((await allRecords(s,"billing")).some(l=>l.metadata.period===localDay(startedAt,p.timezone).slice(0,7)&&l.metadata.closed===true)) throw new AppError(409,"Reopen the closed period before committing this timer");
      return {record:await patchRecord(s,r,{status:"committed",value:(Date.parse(endedAt)-Date.parse(startedAt))/60000,metadata:{...r.metadata,endedAt}},actor,"commit")};
    }
    case "voidTime":
      assertKind(r,"time");if(r.metadata.locked) throw new AppError(409,"Reopen the billing period before voiding locked time");
      if(r.metadata.userId!==actor.id&&!["admin","clinical_admin"].includes(actor.role))throw new AppError(403,"Only the owner or a clinical administrator may void another clinician's time");
      return {record:await patchRecord(s,r,{status:"voided",metadata:{...r.metadata,voidReason:reason(a),voidedBy:actor.name}},actor,"void")};
    case "discardTimer":
      assertKind(r,"time");
      if(r.metadata.userId!==actor.id) throw new AppError(403,"You may only discard your own timer");
      if(!["running","draft"].includes(r.status)) throw new AppError(409,"Only uncommitted time can be discarded");
      return {record:await patchRecord(s,r,{status:"voided",metadata:{...r.metadata,voidReason:reason(a),voidedBy:actor.name}},actor,"discard")};
    case "disconnectDevice":
      assertKind(r,"devices");
      if(!["assigned","active","setup_required"].includes(r.status)) throw new AppError(409,"This device is already disconnected or returned");
      const disconnected=await patchRecord(s,r,{status:"disconnected",metadata:{...r.metadata,disconnectedAt:now(),disconnectedBy:actor.name,disconnectReason:reason(a)}},actor,"disconnect");
      await addRecord(s,"tasks",{title:"Review disconnected monitoring device",patientId:r.patientId,program:r.program,status:"pending",description:"Contact the patient to agree a replacement or monitoring plan.",metadata:{audience:"staff",source:"system",deviceId:r.id}},actor);
      return {record:disconnected};
    case "completeTask": {
      assertKind(r,"tasks");
      if(r.metadata.source==="uncommitted_time")throw new AppError(409,"Commit or discard the linked time entry to resolve this reminder");
      if(actor.role==="patient"&&r.metadata.audience==="staff") throw new AppError(403,"This task belongs to the care team");
      if(actor.role==="patient") await activeMonitoringProgram(s,r.patientId!,r.program);
      if(actor.role==="patient"&&r.metadata.dueAt&&Number.isFinite(Number(r.metadata.windowMinutes))&&Date.now()>Date.parse(String(r.metadata.dueAt))+Number(r.metadata.windowMinutes)*60000) throw new AppError(409,"This task's completion window has ended");
      if(r.status==="completed") return {record:r};
      if(r.status!=="pending") throw new AppError(409,"Only pending tasks can be completed");
      if(actor.role==="patient"&&r.metadata.dueAt&&Date.parse(String(r.metadata.dueAt))>Date.now()) fail("This scheduled task is not due yet");
      const kind=String(r.metadata.taskKind??""),p=r.patientId?await getPatientRow(s,r.patientId):null;
      return {record:await patchRecord(s,r,{status:"completed",metadata:{...r.metadata,completedAt:now(),...(["medication","exercise","education"].includes(kind)&&p?{adherenceKind:kind,activityTitle:r.title,day:localDay(r.date,p.timezone),source:"patient_reported"}:{})}},actor,"complete")};
    }
    case "revokeConsent": {
      assertKind(r,"consents");const why=reason(a);
      for(const e of await allRecords(s,"enrollments")) if(e.patientId===r.patientId&&e.program===r.program&&e.status==="active") await patchRecord(s,e,{status:"paused",metadata:{...e.metadata,pauseReason:"Consent revoked"}},actor,"pause");
      for(const task of await allRecords(s,"tasks")) if(task.patientId===r.patientId&&task.program===r.program&&task.status==="pending"&&task.metadata.audience==="patient") await patchRecord(s,task,{status:"cancelled",metadata:{...task.metadata,cancelReason:"Program consent revoked"}},actor,"cancel");
      return {record:await patchRecord(s,r,{status:"revoked",metadata:{...r.metadata,revokedAt:now(),reason:why}},actor,"revoke")};
    }
    case "approveLine":
    case "rejectLine":
      assertKind(r,"billing");
      if(r.metadata.closed!==true) throw new AppError(409,"Close the period to freeze evidence before reviewing lines");
      if(a.action==="approveLine" && r.metadata.met!==true) fail("Unmet evidence requirements block approval");
      if(a.action==="approveLine" && r.status==="rejected") fail("Recalculate the open period before approving a rejected line");
      return {record:await patchRecord(s,r,{status:a.action==="approveLine"?"approved":"rejected",metadata:{...r.metadata,decidedBy:actor.name,decidedAt:now(),reason:a.action==="rejectLine"?reason(a):"Reviewed by billing staff"}},actor,a.action)};
    case "acceptDraft": {
      assertKind(r,"drafts");if(r.status!=="pending") throw new AppError(409,"Draft has already been reviewed");
      const reviewed=reviewAiDraft(r,payload);
      const capability=String(r.metadata.capability||"draftNote");
      if(!r.patientId&&!["suggestTime","prioritizeQueue"].includes(capability)) fail("Generate a patient-linked draft before creating clinical documentation or a message");
      let output:RecordRow|undefined;
      if(capability==="draftMessage") output=await addRecord(s,"messages",{title:"Reviewed secure message",patientId:r.patientId,program:r.program,status:"sent",description:reviewed.text,metadata:{aiDraftId:r.id,direction:"outbound",sender:actor.name,channel:"secure",reviewedById:actor.id}},actor);
      else if(!["suggestTime","prioritizeQueue"].includes(capability)) output=await addRecord(s,"notes",{title:capability==="draftSummary"?"Reviewed patient summary":"Reviewed clinical note",patientId:r.patientId,program:r.program,status:"draft",description:reviewed.text,metadata:{aiDraftId:r.id,aiProvider:r.metadata.provider,aiPromptVersion:r.metadata.promptVersion,aiReviewedById:actor.id,aiReviewedAt:now(),version:1}},actor);
      const accepted=await patchRecord(s,r,{status:"accepted",metadata:{...r.metadata,...reviewed.metadata,acceptedBy:actor.name,acceptedById:actor.id,acceptedAt:now(),acceptedRecordId:output?.id??null}},actor,"accept");
      return {record:accepted};
    }
    case "rejectDraft":
      assertKind(r,"drafts");if(r.status!=="pending") throw new AppError(409,"Draft has already been reviewed");
      return {record:await patchRecord(s,r,{status:"rejected",metadata:{...r.metadata,rejectedBy:actor.name,rejectedById:actor.id,rejectedAt:now(),rejectionReason:z.string().trim().min(5).max(2000).parse(a.reason)}},actor,"reject")};
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
  if(p.status!=="active") throw new AppError(409,"Activate this patient before starting a new program");
  const catalog=await policyCatalog(s),selected=selectRulepack(catalog,program,undefined,p.payer);
  if(payload.rulepackId!==undefined&&payload.rulepackId!==selected.id) throw new AppError(409,"The program policy changed. Refresh and review its current consent before enrolling.");
  if(p.conditions.length<selected.body.eligibility.min_chronic_conditions) fail("Document the qualifying conditions required by this program policy");
  if(active.some(r=>selected.body.time_rules.exclusive_with_programs.includes(r.program as "RPM"|"RTM"|"CCM"|"PCM"|"BHI"))) throw new AppError(409,"This program policy prohibits the current concurrent enrollment");
  if(payload.initiatingVisitAt!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.initiatingVisitAt))||!Number.isFinite(Date.parse(String(payload.initiatingVisitAt)))||new Date(String(payload.initiatingVisitAt)).toISOString().slice(0,10)!==payload.initiatingVisitAt||Date.parse(String(payload.initiatingVisitAt))>Date.now())) fail("Document a valid past initiating-visit date");
  if(payload.conditionDurationMonths!==undefined&&(!Number.isInteger(payload.conditionDurationMonths)||Number(payload.conditionDurationMonths)<1)) fail("Condition duration must be a positive whole number of months");
  if(selected.body.eligibility.condition_min_duration_months!==null&&Number(payload.conditionDurationMonths??-1)<selected.body.eligibility.condition_min_duration_months) fail("The qualifying condition duration is shorter than this policy requires");
  if(selected.body.eligibility.initiating_visit_required_within_months!==null&&(!payload.initiatingVisitAt||!visitWithinCalendarMonths(String(payload.initiatingVisitAt),localDay(now(),p.timezone),selected.body.eligibility.initiating_visit_required_within_months))) fail("A recent initiating visit is required by this policy");
  if(selected.body.eligibility.required_consents.includes("device_sharing")&&payload.deviceSharing!==true) fail("Explicit device-data sharing consent is required by this policy");
  const enrollment=await addRecord(s,"enrollments",{title:`${program} enrollment`,patientId:p.id,program,status:"active",metadata:{...payload,consent:true,rulepackVersion:selected.body.version,rulepackId:selected.id,activatedBy:actor.name}},actor);
  const consentMethod=z.enum(["verbal","written","electronic"]).parse(payload.consentMethod??"verbal");
  await addRecord(s,"consents",{title:`${program} program consent`,patientId:p.id,program,status:"captured",description:selected.body.consent_text,metadata:{method:consentMethod,captureMode:"staff_attestation",textVersion:selected.body.version,consentTypes:["program",...(payload.deviceSharing===true?["device_sharing"]:[])],capturedBy:actor.name,capturedById:actor.id,capturedAt:now(),enrollmentId:enrollment.id}},actor);
  const templateRow=choosePublished(catalog.filter(row=>row.body.key===selected.body.careplan_template_key),"careplan_template",program);
  const template=templateRow?CareplanTemplateSchema.parse(templateRow.body):null;
  await addRecord(s,"careplans",{title:`${program} care plan`,patientId:p.id,program,status:"draft",description:template?.description??"",metadata:{...template?.sections,schemaVersion:2,version:1,reviewDays:template?.sections.reviewDays??30,enrollmentId:enrollment.id,problems:p.conditions,medications:p.medications,...(payload.conditionDurationMonths?{qualifyingConditionMonths:Number(payload.conditionDurationMonths),qualifyingCondition:String(payload.condition??p.conditions[0]??"")}:{}),...(template?{items:template.items,templateId:templateRow!.id,templateVersion:templateRow!.version}:{})}},actor);
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
  const patient=await getPatientRow(s,a.patientId);
  if(!a.program) fail("Choose the program for this time entry");
  const rs=await allRecords(s);
  if(!rs.some(r=>r.kind==="enrollments" && r.patientId===a.patientId && r.program===a.program && r.status==="active")) fail("Time requires an active program enrollment");
  const start=String(payload.startedAt||""),end=String(payload.endedAt||"");
  await validateTime(s,actor,start,end);
  if((Date.parse(end)-Date.parse(start))/60000>30&&!a.reason?.trim()) fail("A reason is required for manual entries over 30 minutes");
  if(rs.some(r=>r.kind==="billing" && r.metadata.period===localDay(start,patient.timezone).slice(0,7) && r.metadata.closed===true)) throw new AppError(409,"This period is closed");
  return addRecord(s,"time",{title:String(payload.activity||"Care coordination"),patientId:a.patientId,program:a.program,status:"committed",date:start,value:(Date.parse(end)-Date.parse(start))/60000,unit:"min",metadata:{startedAt:start,endedAt:end,activity:String(payload.activity||"care_coordination"),source:"manual",userId:actor.id,credential:actor.credential,reason:a.reason||null}},actor);
}
async function activeMonitoringProgram(s:Store,patientId:string,requested?:string|null) {
  const enrollment=(await allRecords(s,"enrollments")).find(r=>r.patientId===patientId&&r.status==="active"&&(!requested||r.program===requested));
  if(!enrollment?.program) throw new AppError(409,"Monitoring is not active for this program. Contact your care team before sharing more data.");
  return enrollment.program;
}
async function submitCheckin(s:Store,actor:Actor,a:Action,payload:Record<string,unknown>) {
  await getPatientRow(s,a.patientId);
  const program=await activeMonitoringProgram(s,a.patientId!,a.program);
  const instrument=String(payload.instrument||"pain_nrs");
  const lengths:Record<string,number>={phq9:9,gad7:7,pain_nrs:1,odi:10,pgic:1};
  const candidates=(await allRecords(s,"instruments")).filter(r=>r.status==="active"&&r.metadata.key===instrument&&(!r.patientId||r.patientId===a.patientId));
  const configured=payload.instrumentId?candidates.find(r=>r.id===payload.instrumentId):candidates.length===1?candidates[0]:undefined;
  if(!configured)fail("Choose an active configured instrument; specify its identifier when more than one version exists");
  if(Array.isArray(configured.metadata.questions)&&configured.metadata.questions.length&&(configured.metadata.contentApprovedForUse!==true||typeof configured.metadata.sourceRef!=="string"||!configured.metadata.sourceRef.trim()||typeof configured.metadata.licenseNote!=="string"||configured.metadata.licenseNote.trim().length<20||configured.metadata.contentReviewHash!==instrumentContentHash(configured)))throw new AppError(409,"Custom question wording needs a documented local source and license/use review before responses can be collected");
  const answers=payload.answers;
  if(!lengths[instrument] || !Array.isArray(answers) || answers.length!==lengths[instrument] || answers.some(v=>typeof v!=="number" || !Number.isInteger(v) || v<(instrument==="pgic"?1:0) || v>(instrument==="pain_nrs"?10:instrument==="odi"?5:instrument==="pgic"?7:3))) fail("Answers do not match the instrument's required range and question count");
  const numeric=answers as number[], score=instrument==="odi"?numeric.reduce((n,v)=>n+v,0)*2:numeric.reduce((n,v)=>n+v,0);
  const response=await addRecord(s,"responses",{title:`${instrument.toUpperCase()} check-in`,patientId:a.patientId,program,status:"completed",value:score,unit:"score",metadata:{instrument,instrumentId:configured.id,instrumentVersion:configured.metadata.contentVersion??"1",instrumentContentHash:instrumentContentHash(configured),instrumentSnapshot:{title:configured.title,key:instrument,questions:configured.metadata.questions??[],sourceRef:configured.metadata.sourceRef??"",licenseNote:configured.metadata.licenseNote??"",reviewedById:configured.metadata.contentReviewedById??null,reviewedAt:configured.metadata.contentReviewedAt??null},wording:Array.isArray(configured.metadata.questions)&&configured.metadata.questions.length?"locally_reviewed":"synthetic_placeholders",answers:numeric,source:"patient_reported",band:["phq9","gad7"].includes(instrument)?score>=15?"high":score>=10?"moderate":"low":"unclassified"}},actor);
  if((instrument==="phq9"&&numeric[8]!>0) || (instrument==="pain_nrs"&&score>=8)) {
    await addRecord(s,"exceptions",{title:instrument==="phq9"?"Behavioral-health check-in requires immediate review":"High pain score reported",patientId:a.patientId,program,status:"open",severity:instrument==="phq9"?"critical":"high",description:"Follow the practice's clinician-approved escalation procedure.",metadata:{responseId:response.id,ruleKey:`score_${instrument}`}},actor);
  }
  return response;
}
