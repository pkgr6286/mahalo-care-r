import { eq } from "drizzle-orm";
import { records, patients } from "@workspace/db";
import { allRecords, addRecord, patchRecord, now, type Store, type Actor } from "./store";
import { evaluateBilling } from "./billing-engine";
import { AppError } from "./errors";
import { rollingSupplyWindow, localDay, countDeviceDays } from "./periods";
import { localHourInstant } from "./task-schedules";
import {policyCatalog,selectRulepack,bundledPolicyId} from "./program-policies";
import {isCountedMonitoring} from "./counted-monitoring";
import {timeEvidence} from "./time-evidence";

export const billingPeriod=()=>now().slice(0,7);
export function validatePeriod(value:unknown) {
  const period=value===undefined?billingPeriod():String(value);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||period<"2000-01"||period>billingPeriod()) throw new AppError(400,"Choose a valid current or historical month");
  return period;
}
export async function calculateBilling(s:Store, actor:Actor, requestedPeriod=billingPeriod()) {
  const rs=await allRecords(s), ps=await s.select().from(patients);
  const policies=await policyCatalog(s);
  const period=validatePeriod(requestedPeriod);
  const existing=rs.filter(r=>r.kind==="billing" && r.metadata.period===period);
  if(existing.some(r=>r.metadata.closed===true)) throw new AppError(409,"This period is closed. Reopen it with a reason before recalculating.");
  const output=[];
  for(const enrollment of rs.filter(r=>r.kind==="enrollments"&&localDay(r.date,ps.find(p=>p.id===r.patientId)?.timezone??"UTC").slice(0,7)<=period&&(!r.metadata.endedAt||String(r.metadata.endedAt).slice(0,7)>=period)&&["active","paused","discharged"].includes(r.status))) {
    const p=ps.find(p=>p.id===enrollment.patientId);if(!p) continue;
    if(p.status!=="active") continue;
    const endDay=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).toISOString().slice(0,10);
    const afterEnd=new Date(Date.parse(`${endDay}T00:00:00Z`)+86400000).toISOString().slice(0,10);
    const clock=period===billingPeriod()?new Date():new Date(new Date(localHourInstant(afterEnd,0,p.timezone)).getTime()-1);
    const priorSnapshot=existing.find(r=>r.metadata.enrollmentId===enrollment.id);
    const periodPayer=typeof priorSnapshot?.metadata.payer==="string"?priorSnapshot.metadata.payer:p.payer;
    const selected=selectRulepack(policies,enrollment.program!,String(enrollment.metadata.rulepackId??bundledPolicyId(enrollment.program!)),periodPayer,localDay(clock,p.timezone),priorSnapshot&&"payerPolicyId" in priorSnapshot.metadata?priorSnapshot.metadata.payerPolicyId as string|null:undefined);
    const mine=rs.filter(r=>r.patientId===p.id && r.program===enrollment.program);
    const inPeriod=mine.filter(r=>localDay(r.date,p.timezone).startsWith(period)&&Date.parse(r.date)<=clock.getTime());
    const time=inPeriod.filter(r=>r.kind==="time" && r.status==="committed" && !["admin","billing"].includes(String(r.metadata.credential)));
    const eligibleActivities=selected.body.time_rules.activities,credentials=selected.body.time_rules.counts_for_management;
    const eligible=time.filter(r=>eligibleActivities.includes(String(r.metadata.activity))&&[...credentials.clinical_staff_general_supervision,...credentials.practitioner_only].includes(String(r.metadata.credential)));
    const practitioner=eligible.filter(r=>credentials.practitioner_only.includes(String(r.metadata.credential)));
    const staff=eligible.filter(r=>!credentials.practitioner_only.includes(String(r.metadata.credential)));
    const supplyWindow=rollingSupplyWindow(String(enrollment.metadata.supplyAnchor||enrollment.date),clock,p.timezone);
    const obs=mine.filter(r=>{
      if(r.metadata.valid===false||Date.parse(r.date)>clock.getTime()||localDay(r.date,p.timezone)<supplyWindow.startDay||localDay(r.date,p.timezone)>=supplyWindow.endDayExclusive) return false;
      return isCountedMonitoring(r,enrollment.program!,selected.body);
    });
    const days=countDeviceDays(obs,p.timezone);
    const priorApproved=rs.filter(r=>r.kind==="billing"&&r.status==="approved"&&r.metadata.enrollmentId===enrollment.id);
    const plan=mine.filter(r=>r.kind==="careplans"&&["active","superseded","closed"].includes(r.status)&&Date.parse(String(r.metadata.signedAt??r.date))<=clock.getTime()).sort((a,b)=>String(b.metadata.signedAt??b.date).localeCompare(String(a.metadata.signedAt??a.date)))[0];
    const consents=mine.filter(r=>r.kind==="consents"&&Date.parse(r.date)<=clock.getTime()&&(r.status==="captured"||r.status==="revoked"&&Date.parse(String(r.metadata.revokedAt))>clock.getTime()));
    const liveInteractions=inPeriod.filter(r=>r.kind==="interactions"&&r.status==="completed"&&r.metadata.isLiveTwoWay===true&&!["stub","console","simulated"].includes(String(r.metadata.driver)));
    const results=evaluateBilling({
      program:enrollment.program!,minutes:(["RPM","RTM"].includes(enrollment.program||"")?eligible:staff).reduce((n,r)=>n+r.value,0),practitionerMinutes:practitioner.reduce((n,r)=>n+r.value,0),
      rtmVariant:enrollment.metadata.variant==="respiratory"?"respiratory":"msk",
      deviceDays:days,liveInteractions:liveInteractions.length,
      supplyWindowComplete:supplyWindow.complete,
      setupAlreadyBilled:priorApproved.some(r=>["99453","98975"].includes(String(r.metadata.cpt))),
      supplyAlreadyBilled:priorApproved.some(r=>["99445","99454","98985","98977","98984","98976"].includes(String(r.metadata.cpt))&&(r.metadata.supplyWindow as Record<string,unknown>|undefined)?.startDay===supplyWindow.startDay),
      consent:consents.length>0,activePlan:!!plan,
      consentTypes:consents.flatMap(r=>Array.isArray(r.metadata.consentTypes)?r.metadata.consentTypes.map(String):/device-sharing consent/i.test(r.title)?["program","device_sharing"]:["program"]),
      setup:mine.some(r=>r.kind==="devices" && r.metadata.setupCompleted===true),conditionCount:p.conditions.length,
      assessment:enrollment.metadata.assessment===true&&Date.parse(String(enrollment.metadata.assessedAt??enrollment.date))<=clock.getTime(),scoreInPeriod:inPeriod.some(r=>r.kind==="responses"),
      instrumentsInPeriod:inPeriod.filter(r=>r.kind==="responses").map(r=>String(r.metadata.instrument)),
      eligibleDevice:mine.some(r=>r.kind==="devices"&&Date.parse(r.date)<=clock.getTime()&&(selected.body.eligibility.device_requirement!=="fda_cleared"||r.metadata.fdaCleared===true||r.metadata.deviceCleared===true))||obs.some(r=>r.metadata.deviceCleared===true||enrollment.program==="RTM"),
      cocm:enrollment.metadata.cocm===true,hasConsultant:!!enrollment.metadata.consultant&&Date.parse(String(enrollment.metadata.consultantAssignedAt??enrollment.date))<=clock.getTime(),
      initialMonth:localDay(enrollment.date,p.timezone).startsWith(period),complexity:plan?.metadata.complexity==="moderate_or_high",
      conditionDurationMonths:Number(plan?.metadata.qualifyingConditionMonths??-1),
      initiatingVisitAt:typeof enrollment.metadata.initiatingVisitAt==="string"?enrollment.metadata.initiatingVisitAt:undefined,asOfDay:localDay(clock,p.timezone),
    },selected.body);
    for(const evidence of results) {
      const code=selected.body.codes.find(c=>c.cpt===evidence.cpt),supply=code?.kind==="supply";
      const counted=timeEvidence(enrollment.program!,code,{eligible,staff,practitioner});
      const metadata={...evidence,period,enrollmentId:enrollment.id,closed:false,periodStatus:"open",provisional:true,periodKind:supply?"rolling_30_days":"calendar_month",supplyWindow:supply?supplyWindow:null,location:p.location,payer:periodPayer,billingProvider:enrollment.metadata.billingProvider??"",rulepackId:selected.id,rulepackVersion:selected.body.version,rulepackHash:selected.hash,payerPolicyId:selected.payerPolicyId,payerPolicyVersion:selected.payerVersion,policySnapshot:selected.body,codeKind:code?.kind,requirements:code?.requires,minutesBucket:code?.minutes_bucket,
        sourceTimeIds:counted.map(r=>r.id),excludedTime:(code?.requires.minutes_min===undefined?[]:time.filter(r=>!counted.some(e=>e.id===r.id))).map(r=>({id:r.id,reason:eligible.some(e=>e.id===r.id)?"Credential belongs to a different code's minutes bucket":"Activity or credential is not counted by this program policy"})),
        sourceObservationIds:supply?obs.map(r=>r.id):[],sourceSupplyIds:supply?obs.map(r=>r.id):[],sourceInteractionIds:code?.requires.live_interactive_min?liveInteractions.map(r=>r.id):[],sourceResponseIds:code?.requires.current_score?inPeriod.filter(r=>r.kind==="responses").map(r=>r.id):[],
        sourceEnrollmentIds:[enrollment.id],sourcePlanIds:plan?[plan.id]:[],sourceConsentIds:consents.map(r=>r.id),sourceDeviceIds:mine.filter(r=>r.kind==="devices"&&Date.parse(r.date)<=clock.getTime()).map(r=>r.id)};
      const previous=existing.find(r=>r.metadata.enrollmentId===enrollment.id && r.metadata.cpt===evidence.cpt);
      if(previous?.status==="approved") {output.push(previous);continue;}
      const input={title:`${evidence.cpt} · ${enrollment.program}`,patientId:p.id,program:enrollment.program,status:evidence.met?"candidate":"blocked",description:evidence.met?"Evidence thresholds met. Human billing review required.":evidence.blockers.join("; "),value:evidence.units,unit:"units",metadata};
      output.push(previous?await patchRecord(s,previous,input,actor,"recalculate"):await addRecord(s,"billing",input,actor));
    }
  }
  return output;
}

export async function closeBilling(s:Store,actor:Actor,requestedPeriod=billingPeriod()) {
  const period=validatePeriod(requestedPeriod);
  const current=(await allRecords(s,"billing")).filter(r=>r.metadata.period===period);
  if(current.length && current.every(r=>r.metadata.closed)) return current;
  // Inactive/discharged patients can retain evidence from an earlier calculation.
  // Close the entire period snapshot, not just the currently active panel. Also finish
  // a previously partial close without modifying evidence that was already frozen.
  const recalculated=current.some(r=>r.metadata.closed)?[]:await calculateBilling(s,actor,period);
  const refreshedIds=new Set(recalculated.map(r=>r.id));
  const lines=[...recalculated,...current.filter(r=>!refreshedIds.has(r.id))];
  const closedLines=[];
  for(const line of lines) closedLines.push(line.metadata.closed?line:await patchRecord(s,line,{metadata:{...line.metadata,closed:true,periodStatus:"closed",closedAt:now(),closedBy:actor.name}},actor,"close"));
  const eligibleIds=new Set(lines.flatMap(l=>(l.metadata.sourceTimeIds as string[])||[]));
  for(const t of await allRecords(s,"time")) if(eligibleIds.has(t.id)) await s.update(records).set({metadata:{...t.metadata,locked:true,period}}).where(eq(records.id,t.id));
  return closedLines;
}
