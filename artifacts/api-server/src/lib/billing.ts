import { eq } from "drizzle-orm";
import { records, patients } from "@workspace/db";
import { allRecords, addRecord, patchRecord, now, type Store, type Actor } from "./store";
import { evaluateBilling } from "./billing-engine";
import { AppError } from "./errors";
import { rollingSupplyWindow, localDay, countDeviceDays } from "./periods";

export async function calculateBilling(s:Store, actor:Actor) {
  const rs=await allRecords(s), ps=await s.select().from(patients);
  const period=now().slice(0,7);
  const existing=rs.filter(r=>r.kind==="billing" && r.metadata.period===period);
  if(existing.some(r=>r.metadata.closed===true)) throw new AppError(409,"This period is closed. Reopen it with a reason before recalculating.");
  const output=[];
  for(const enrollment of rs.filter(r=>r.kind==="enrollments" && r.status==="active")) {
    const p=ps.find(p=>p.id===enrollment.patientId);if(!p) continue;
    const mine=rs.filter(r=>r.patientId===p.id && r.program===enrollment.program);
    const inPeriod=mine.filter(r=>localDay(r.date,p.timezone).startsWith(period));
    const time=inPeriod.filter(r=>r.kind==="time" && r.status==="committed" && !["admin","billing"].includes(String(r.metadata.credential)));
    const eligibleActivities=["review_data","phone_call","video_visit","care_plan_update","care_coordination","patient_education","documentation"];
    const eligible=time.filter(r=>eligibleActivities.includes(String(r.metadata.activity)));
    const practitioner=eligible.filter(r=>["MD","DO","NP","PA"].includes(String(r.metadata.credential)));
    const staff=eligible.filter(r=>!["MD","DO","NP","PA"].includes(String(r.metadata.credential)));
    const supplyWindow=rollingSupplyWindow(String(enrollment.metadata.supplyAnchor||enrollment.date),new Date(),p.timezone);
    const obs=mine.filter(r=>r.kind==="observations" && r.metadata.valid!==false && localDay(r.date,p.timezone)>=supplyWindow.startDay && localDay(r.date,p.timezone)<supplyWindow.endDayExclusive && (enrollment.program==="RPM"?r.metadata.source==="device" && r.metadata.deviceCleared===true:r.metadata.source!=="wearable"));
    const days=countDeviceDays(obs,p.timezone);
    const priorApproved=rs.filter(r=>r.kind==="billing"&&r.status==="approved"&&r.metadata.enrollmentId===enrollment.id);
    const plan=mine.find(r=>r.kind==="careplans" && r.status==="active");
    const results=evaluateBilling({
      program:enrollment.program!,minutes:(["RPM","RTM"].includes(enrollment.program||"")?eligible:staff).reduce((n,r)=>n+r.value,0),practitionerMinutes:practitioner.reduce((n,r)=>n+r.value,0),
      deviceDays:days,liveInteractions:inPeriod.filter(r=>r.kind==="interactions" && r.status==="completed" && r.metadata.isLiveTwoWay===true).length,
      supplyWindowComplete:supplyWindow.complete,
      setupAlreadyBilled:priorApproved.some(r=>["99453","98975"].includes(String(r.metadata.cpt))),
      supplyAlreadyBilled:priorApproved.some(r=>["99445","99454","98985","98977"].includes(String(r.metadata.cpt))&&(r.metadata.supplyWindow as Record<string,unknown>|undefined)?.startDay===supplyWindow.startDay),
      consent:mine.some(r=>r.kind==="consents" && r.status==="captured"),activePlan:!!plan,
      setup:mine.some(r=>r.kind==="devices" && r.metadata.setupCompleted===true),conditionCount:p.conditions.length,
      assessment:enrollment.metadata.assessment===true,scoreInPeriod:inPeriod.some(r=>r.kind==="responses"),
      cocm:enrollment.metadata.cocm===true,hasConsultant:!!enrollment.metadata.consultant,
      initialMonth:enrollment.date.startsWith(period),complexity:plan?.metadata.complexity==="moderate_or_high",
    });
    for(const evidence of results) {
      const supply=["99445","99454","98985","98977"].includes(evidence.cpt);
      const metadata={...evidence,period,enrollmentId:enrollment.id,closed:false,periodStatus:"open",provisional:true,periodKind:supply?"rolling_30_days":"calendar_month",supplyWindow:supply?supplyWindow:null,sourceTimeIds:eligible.map(r=>r.id),sourceObservationIds:obs.map(r=>r.id)};
      const previous=existing.find(r=>r.metadata.enrollmentId===enrollment.id && r.metadata.cpt===evidence.cpt);
      if(previous?.status==="approved") {output.push(previous);continue;}
      const input={title:`${evidence.cpt} · ${enrollment.program}`,patientId:p.id,program:enrollment.program,status:evidence.met?"candidate":"blocked",description:evidence.met?"Evidence thresholds met. Human billing review required.":evidence.blockers.join("; "),value:evidence.units,unit:"units",metadata};
      output.push(previous?await patchRecord(s,previous,input,actor,"recalculate"):await addRecord(s,"billing",input,actor));
    }
  }
  return output;
}

export async function closeBilling(s:Store,actor:Actor) {
  const current=(await allRecords(s,"billing")).filter(r=>r.metadata.period===now().slice(0,7));
  if(current.length && current.every(r=>r.metadata.closed)) return current;
  const lines=await calculateBilling(s,actor);
  const closedLines=[];
  for(const line of lines) closedLines.push(await patchRecord(s,line,{metadata:{...line.metadata,closed:true,periodStatus:"closed",closedAt:now(),closedBy:actor.name}},actor,"close"));
  const eligibleIds=new Set(lines.flatMap(l=>(l.metadata.sourceTimeIds as string[])||[]));
  for(const t of await allRecords(s,"time")) if(eligibleIds.has(t.id)) await s.update(records).set({metadata:{...t.metadata,locked:true,period:now().slice(0,7)}}).where(eq(records.id,t.id));
  return closedLines;
}
