import {visitWithinCalendarMonths,type Rulepack} from "./program-policy-schema";
export type BillingInputs = {
  program: string; minutes: number; practitionerMinutes: number; deviceDays: number;
  liveInteractions: number; consent: boolean; activePlan: boolean; setup: boolean;
  conditionCount: number; assessment: boolean; scoreInPeriod: boolean;
  cocm: boolean; initialMonth: boolean; hasConsultant: boolean; complexity: boolean;
  supplyWindowComplete?:boolean;setupAlreadyBilled?:boolean;supplyAlreadyBilled?:boolean;
  rtmVariant?:"msk"|"respiratory";
  conditionDurationMonths?:number;initiatingVisitAt?:string;asOfDay?:string;
  consentTypes?:string[];
  instrumentsInPeriod?:string[];eligibleDevice?:boolean;
};
export type Evidence = { cpt:string; units:number; met:boolean; blockers:string[]; minutes:number; deviceDays:number };
export type Code = { cpt:string; min?:number; max?:number; maxExclusive?:number; days?:number; daysMax?:number; live?:boolean; liveMin?:number; setup?:boolean; base?:number; block?:number; cap?:number; practitioner?:boolean; assessment?:boolean; score?:boolean; complex?:boolean; cocm?:boolean;disabled?:boolean;parent?:string;excludes?:string[] };

const packs: Record<string, Code[]> = {
  RPM: [{cpt:"99453",setup:true},{cpt:"99445",days:2,daysMax:15},{cpt:"99454",days:16},{cpt:"99470",min:10,max:19.999999,live:true},{cpt:"99457",min:20,live:true},{cpt:"99458",base:20,block:20,cap:2,live:true}],
  RTM: [{cpt:"98975",setup:true},{cpt:"98985",days:2,daysMax:15},{cpt:"98977",days:16},{cpt:"98979",min:10,max:19.999999,live:true},{cpt:"98980",min:20,live:true},{cpt:"98981",base:20,block:20,cap:2,live:true}],
  CCM: [{cpt:"99490",min:20},{cpt:"99439",base:20,block:20,cap:2},{cpt:"99491",min:30,practitioner:true},{cpt:"99437",base:30,block:30,cap:2,practitioner:true},{cpt:"99487",min:60,complex:true},{cpt:"99489",base:60,block:30,cap:2,complex:true}],
  PCM: [{cpt:"99424",min:30,practitioner:true},{cpt:"99425",base:30,block:30,cap:2,practitioner:true},{cpt:"99426",min:30},{cpt:"99427",base:30,block:30,cap:2}],
  BHI: [{cpt:"99484",min:20,assessment:true},{cpt:"99492",min:70,cocm:true},{cpt:"99493",min:60,cocm:true},{cpt:"99494",base:60,block:30,cap:2,cocm:true},{cpt:"G2214",min:30,max:59.999999,cocm:true}],
};
export const bundledBillingCodes=packs;

/** Provisional demonstration rule packs, not a verified reimbursement determination. */
export function evaluateBilling(input: BillingInputs,policy?:Rulepack): Evidence[] {
  const codes:Code[]=policy?policy.codes.filter(c=>!["msk","respiratory"].includes(c.applies_to)||c.applies_to===(input.rtmVariant??"msk")).map(c=>({
    cpt:c.cpt,min:c.requires.minutes_min,maxExclusive:c.requires.minutes_max===undefined?undefined:c.requires.minutes_max+1,
    days:c.requires.device_days_min,daysMax:c.requires.device_days_max,liveMin:c.requires.live_interactive_min,
    setup:c.kind==="setup",base:c.base_minutes??policy.codes.find(parent=>parent.cpt===c.parent)?.requires.minutes_min,
    block:c.requires.minutes_per_unit,cap:c.max_units,practitioner:c.minutes_bucket==="practitioner",
    assessment:c.requires.initial_assessment,score:c.requires.current_score,complex:c.family==="complex",cocm:c.family==="cocm",
    disabled:c.disabled,parent:c.parent,excludes:c.excludes,
  })):(packs[input.program] || []).map(code=>input.program==="RTM"&&input.rtmVariant==="respiratory"?{...code,cpt:code.cpt==="98985"?"98984":code.cpt==="98977"?"98976":code.cpt}:code);
  const results=codes.map(code => {
    const blockers: string[] = [];
    const minutes = code.practitioner ? input.practitionerMinutes : input.minutes;
    if(code.disabled) blockers.push("This code is disabled by the selected payer policy");
    if(policy&&input.conditionCount<policy.eligibility.min_chronic_conditions) blockers.push(`Policy requires ${policy.eligibility.min_chronic_conditions} documented conditions`);
    if(policy?.eligibility.condition_min_duration_months!=null&&(input.conditionDurationMonths??-1)<policy.eligibility.condition_min_duration_months) blockers.push("Qualifying condition duration is not documented for this policy");
    if(policy?.eligibility.initiating_visit_required_within_months!=null&&(!input.initiatingVisitAt||!input.asOfDay||!visitWithinCalendarMonths(input.initiatingVisitAt,input.asOfDay,policy.eligibility.initiating_visit_required_within_months))) blockers.push("A recent initiating visit is required by this policy");
    if (!input.consent) blockers.push("Program consent is required");
    if(policy&&policy.eligibility.required_consents.some(type=>type!=="program"&&!(input.consentTypes??[]).includes(type))) blockers.push("The program policy requires additional documented data-sharing consent");
    if(policy&&policy.eligibility.device_requirement!=="none"&&input.eligibleDevice!==true) blockers.push("An eligible monitoring device or supported app is required by this policy");
    if(policy&&policy.required_instruments.some(key=>!(input.instrumentsInPeriod??[]).includes(key))) blockers.push("A required scored instrument is missing for this period");
    if (!input.activePlan) blockers.push("An active signed care plan is required");
    if (input.program === "CCM" && input.conditionCount < 2) blockers.push("Two chronic conditions must be documented");
    if (input.program === "PCM" && input.conditionCount < 1) blockers.push("A qualifying condition must be documented");
    if (code.setup && !input.setup) blockers.push("Device setup and education are not complete");
    if (code.setup && input.setupAlreadyBilled) blockers.push("Setup has already been approved for this enrollment");
    if (code.days && input.supplyWindowComplete===false) blockers.push("The 30-day supply window is not complete");
    if (code.days && input.supplyAlreadyBilled) blockers.push("A supply code has already been approved for this 30-day window");
    if (code.days && input.deviceDays < code.days) blockers.push(`Needs ${code.days-input.deviceDays} more counted device days`);
    if (code.daysMax && input.deviceDays > code.daysMax) blockers.push("Long-period supply code applies instead");
    if (code.min && minutes < code.min) blockers.push(`Needs ${(code.min-minutes).toFixed(1).replace(".0","")} more eligible minutes`);
    if (code.max && minutes > code.max) blockers.push("Higher management tier applies instead");
    if(code.maxExclusive!==undefined&&minutes>=code.maxExclusive) blockers.push("Higher management tier applies instead");
    if (code.live && !input.liveInteractions) blockers.push("A completed live two-way interaction is required");
    if(code.liveMin&&input.liveInteractions<code.liveMin) blockers.push("A completed live two-way interaction is required");
    if (code.assessment && (!input.assessment || !input.scoreInPeriod)) blockers.push("Initial assessment and a scored scale this period are required");
    if(code.score&&!input.scoreInPeriod&&!code.assessment&&!code.cocm) blockers.push("A current scored scale is required");
    if (code.cocm && (!input.cocm || !input.hasConsultant || !input.scoreInPeriod)) blockers.push("CoCM registry, consultant and current score are required");
    if (code.cpt==="99492" && !input.initialMonth) blockers.push("Initial-month code is not applicable");
    if (code.cpt==="99493" && input.initialMonth) blockers.push("Subsequent-month code is not applicable");
    if (code.complex && !input.complexity) blockers.push("Moderate/high complexity must be documented");
    if (input.program==="CCM" && code.practitioner && input.minutes>=20) blockers.push("Staff-minute family selected; cannot combine CCM base families");
    if (input.program==="CCM" && code.complex && input.minutes<60) blockers.push("Complex CCM threshold not reached");
    if (input.program==="CCM" && !code.complex && !code.practitioner && input.complexity && input.minutes>=60) blockers.push("Complex CCM family selected instead");
    if (input.program==="BHI" && !code.cocm && input.cocm) blockers.push("CoCM family selected instead");
    if(input.program==="PCM" && code.practitioner && input.minutes>=30) blockers.push("Staff-minute family selected; cannot combine PCM base families");
    if(code.cpt==="G2214"&&input.initialMonth&&minutes>=60&&minutes<70) {
      const higher=blockers.indexOf("Higher management tier applies instead");if(higher>=0) blockers.splice(higher,1);
    }
    const base=code.cpt==="99494"?(input.initialMonth?70:60):(code.base||0);
    let units = code.block ? Math.min(Math.floor((minutes-base)/code.block),code.cap||99) : 1;
    if (code.block && units < 1) blockers.push("No full add-on block beyond the base threshold");
    units = Math.max(0,units);
    return {cpt:code.cpt, units: blockers.length?0:units, met:blockers.length===0, blockers:[...new Set(blockers)],minutes,deviceDays:input.deviceDays};
  });
  for(const [i,code] of codes.entries()) {
    if(!results[i]!.met) continue;
    const parent=code.cpt==="99494"?(input.initialMonth?"99492":"99493"):code.parent;
    if(parent&&!results.find(r=>r.cpt===parent)?.met) {
      results[i]!.met=false;results[i]!.units=0;results[i]!.blockers.push("The parent code does not qualify");
    }
  }
  const beforeExclusions=results.map(r=>({...r}));
  for(const [i,code] of codes.entries()) {
    if(!results[i]!.met) continue;
    for(const other of code.excludes??[]) {
      const j=codes.findIndex(c=>c.cpt===other);
      if(j<0||!beforeExclusions[j]!.met) continue;
      const score=(c:Code)=>c.days??c.min??c.base??0;
      if(score(codes[j]!)>score(code)||score(codes[j]!)===score(code)&&j<i) {
        results[i]!.met=false;results[i]!.units=0;results[i]!.blockers.push(`Mutually exclusive code ${other} applies instead`);
      }
    }
  }
  return results;
}

export function intervalsOverlap(start: string, end: string, otherStart: string, otherEnd: string) {
  return new Date(start).getTime()<new Date(otherEnd).getTime() && new Date(end).getTime()>new Date(otherStart).getTime();
}
