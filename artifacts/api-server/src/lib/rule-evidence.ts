import type {PatientRow,RecordRow,ProgramPolicyRow} from "@workspace/db";
import type {ClinicalRule} from "./clinical-rule-schema";
import type {RuleEvidence} from "./rules-engine";
import {policyHash,selectRulepack,bundledPolicyId} from "./program-policies";
import type {Rulepack} from "./program-policy-schema";
import {countDeviceDays,localDay} from "./periods";
import {AppError} from "./errors";
import {isCountedMonitoring} from "./counted-monitoring";
export function ruleEvidence(rule:ClinicalRule,program:string|undefined,p:PatientRow,mine:RecordRow[],catalog:ProgramPolicyRow[],clock:Date):RuleEvidence&{policy?:Record<string,unknown>} {
  const enrollments=mine.filter(r=>r.kind==="enrollments"&&r.status==="active"&&(!program||r.program===program));
  const enrolledAt=enrollments.map(r=>r.date).sort()[0],today=localDay(clock,p.timezone),period=today.slice(0,7);
  const [year,month,day]=today.split("-").map(Number);
  let daysLeft=new Date(Date.UTC(year!,month!,0)).getUTCDate()-day!;
  const times=mine.filter(r=>r.kind==="time"&&r.status==="committed"&&(!program||r.program===program)&&localDay(r.date,p.timezone).startsWith(period)&&Date.parse(r.date)<=clock.getTime());
  let minutes=times.reduce((n,r)=>n+r.value,0),observations=mine.filter(r=>r.kind==="observations"&&r.metadata.valid!==false&&(!program||r.program===program)&&Date.parse(r.date)<=clock.getTime()),target=rule.value;
  if(!rule.code||!program) return {minutes,deviceDays:countDeviceDays(observations.filter(r=>localDay(r.date,p.timezone).startsWith(period)),p.timezone),daysLeft,enrolledAt,period,program};
  const enrollment=enrollments[0];if(!enrollment) throw new AppError(400,"A code-based risk rule requires an active program enrollment");
  const prior=mine.find(r=>r.kind==="billing"&&r.metadata.period===period&&r.metadata.enrollmentId===enrollment.id);
  const selected=selectRulepack(catalog,program as Rulepack["key"],String(enrollment.metadata.rulepackId||bundledPolicyId(program)),String(prior?.metadata.payer??p.payer),today,prior&&Object.hasOwn(prior.metadata,"payerPolicyId")?prior.metadata.payerPolicyId as string|null:undefined);
  const code=selected.body.codes.find(c=>c.cpt===rule.code&&!c.disabled);
  if(!code) throw new AppError(400,"The risk-rule code is unavailable in the enrollment's selected policy");
  if(["msk","respiratory"].includes(code.applies_to)&&code.applies_to!==(enrollment.metadata.variant??"msk")) throw new AppError(400,"The risk-rule code does not apply to this RTM variant");
  if(rule.kind==="time_budget") {
    const credentials=code.minutes_bucket==="practitioner"?selected.body.time_rules.counts_for_management.practitioner_only:selected.body.time_rules.counts_for_management.clinical_staff_general_supervision;
    const eligible=times.filter(r=>credentials.includes(String(r.metadata.credential))&&(code.minutes_bucket==="practitioner"||!selected.body.time_rules.counts_for_management.practitioner_only.includes(String(r.metadata.credential)))&&selected.body.time_rules.activities.includes(String(r.metadata.activity)));
    const base=code.cpt==="99494"?(localDay(enrollment.date,p.timezone).startsWith(period)?70:60):code.base_minutes??0;
    minutes=eligible.reduce((n,r)=>n+r.value,0);target=code.requires.minutes_min??base+(code.requires.minutes_per_unit??0);
    return {minutes,deviceDays:0,daysLeft,enrolledAt,target,period,program,sourceIds:eligible.map(r=>r.id),policy:{rulepackId:selected.id,rulepackHash:policyHash(selected.body),payerPolicyId:selected.payerPolicyId}};
  }
  const anchor=String(enrollment.metadata.supplyAnchor??enrollment.date),anchorDay=/^\d{4}-\d{2}-\d{2}$/.test(anchor)?anchor:localDay(anchor,p.timezone),start=Date.parse(`${anchorDay}T00:00:00Z`),nowDay=Date.parse(`${today}T00:00:00Z`);
  const elapsed=Math.max(0,Math.floor((nowDay-start)/86400000)),windowStart=start+Math.floor(elapsed/30)*30*86400000,windowEnd=windowStart+30*86400000;
  daysLeft=Math.max(0,Math.ceil((windowEnd-nowDay)/86400000));
  observations=mine.filter(r=>{
    const date=Date.parse(`${localDay(r.date,p.timezone)}T00:00:00Z`);
    return r.program===program&&Date.parse(r.date)<=clock.getTime()&&date>=windowStart&&date<windowEnd&&isCountedMonitoring(r,program,selected.body);
  });
  return {minutes,deviceDays:countDeviceDays(observations,p.timezone),daysLeft,enrolledAt,target:code.requires.device_days_min??0,period,program,sourceIds:observations.map(r=>r.id),policy:{rulepackId:selected.id,rulepackHash:policyHash(selected.body),payerPolicyId:selected.payerPolicyId}};
}
