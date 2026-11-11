import {parseClinicalRule,type ClinicalRule} from "./clinical-rule-schema";
export type RuleSignal={id?:string;date:string;value:number;kind:string;metadata:Record<string,unknown>};
export type RuleDefinition={kind:string;[key:string]:unknown};
export type RuleEvidence={minutes:number;deviceDays:number;daysLeft?:number;enrolledAt?:string;target?:number;program?:string;period?:string;sourceIds?:string[]};
export type RuleOutcome={matched:boolean;observed:number;explanation:string;sourceIds:string[];metric:string};
export function compare(value:number,op:string,target=0,low=0,high=0) {
  return op==="gt"?value>target:op==="lt"?value<target:op==="lte"?value<=target:op==="outside"?value<low||value>high:value>=target;
}
function parameter(signal:RuleSignal,loinc?:string) {
  if(!loinc||signal.metadata.loinc===loinc) return signal.value;
  if(loinc==="8462-4"&&signal.metadata.loinc==="8480-6"&&typeof signal.metadata.diastolic==="number") return signal.metadata.diastolic;
  return undefined;
}
const id=(s:RuleSignal)=>s.id??`${s.kind}:${s.date}:${s.value}`;
export function evaluateRule(definition:RuleDefinition|ClinicalRule,signals:RuleSignal[],clock:Date,evidence?:RuleEvidence):RuleOutcome {
  const r=parseClinicalRule(definition as Record<string,unknown>),now=clock.getTime();
  const ordered=signals.filter(s=>Number.isFinite(s.value)&&Number.isFinite(Date.parse(s.date))&&Date.parse(s.date)<=now).sort((a,b)=>b.date.localeCompare(a.date));
  const all=[...new Map(ordered.map(s=>[id(s),s])).values()];
  const window=all.filter(s=>Date.parse(s.date)>=now-r.window_days*86400000);
  const observations=window.filter(s=>s.kind==="observations"&&s.metadata.valid!==false);
  const out=(matched:boolean,observed:number,explanation:string,sources:RuleSignal[],metric:string):RuleOutcome=>({matched,observed,explanation,sourceIds:[...new Set(sources.map(id))].sort(),metric});
  const cmp=(v:number)=>compare(v,r.op,r.value,r.low,r.high);
  switch(r.kind) {
    case "threshold": {
      const candidates=all.filter(s=>s.kind==="observations"&&s.metadata.valid!==false&&Date.parse(s.date)>=now-r.within_hours*3600000);
      const conditions=r.any_of??[{loinc:r.loinc,op:r.op,value:r.value,low:r.low,high:r.high}];
      const matched=candidates.filter(s=>conditions.some(c=>{const value=parameter(s,c.loinc);return value!==undefined&&compare(value,c.op,c.value,c.low,c.high);}));
      const latest=matched[0],condition=latest&&conditions.find(c=>{const value=parameter(latest,c.loinc);return value!==undefined&&compare(value,c.op,c.value,c.low,c.high);});
      return out(matched.length>=r.confirm_with_n_readings,latest&&condition?parameter(latest,condition.loinc)??0:0,`${matched.length} distinct qualifying readings in ${r.within_hours} hours; ${r.confirm_with_n_readings} required`,matched,"reading");
    }
    case "trend": {
      const points=observations.flatMap(s=>{const v=parameter(s,r.loinc);return v===undefined?[]:[{s,v}];}).reverse();
      let observed=0;
      if(points.length) {
        if(r.stat==="mean") observed=points.reduce((n,p)=>n+p.v,0)/points.length;
        else if(r.stat==="max") observed=Math.max(...points.map(p=>p.v));
        else if(r.stat==="delta") observed=points.at(-1)!.v-points[0]!.v;
        else {
          const xs=points.map(p=>(Date.parse(p.s.date)-Date.parse(points[0]!.s.date))/86400000),mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=points.reduce((a,p)=>a+p.v,0)/points.length;
          const denominator=xs.reduce((n,x)=>n+(x-mx)**2,0);
          observed=denominator?points.reduce((n,p,i)=>n+(xs[i]!-mx)*(p.v-my),0)/denominator:0;
        }
      }
      return out(points.length>=r.min_points&&cmp(observed),observed,`${r.stat} over ${points.length} parameter-matched points in ${r.window_days} days; ${r.min_points} required`,points.map(p=>p.s),r.stat==="slope"?"units_per_day":r.stat);
    }
    case "missing_data": {
      const valid=all.filter(s=>r.stream==="device"?s.kind==="observations"&&s.metadata.valid!==false&&(s.metadata.source==="device"||s.metadata.deviceCleared===true):r.stream==="epro"?s.kind==="responses"&&(!r.instrument_key||s.metadata.instrument===r.instrument_key):s.kind==="adherence"||s.kind==="tasks"&&["completed","done","skipped"].includes(String(s.metadata.status)));
      const latest=valid[0],enrolledAt=Date.parse(evidence?.enrolledAt??""),age=Number.isFinite(enrolledAt)?Math.max(0,(now-enrolledAt)/86400000):365;
      const days=latest?(now-Date.parse(latest.date))/86400000:age;
      return out(age>=r.only_if_enrolled_days_gte&&days>=r.days_without,days,`${r.stream}: ${days.toFixed(2)} days since valid data or enrollment; enrollment age ${age.toFixed(2)} days`,latest?[latest]:[],"days");
    }
    case "adherence": {
      const tasks=window.filter(s=>["tasks","adherence"].includes(s.kind)&&s.metadata.audience!=="staff"&&!["cancelled","superseded"].includes(String(s.metadata.status))&&(!r.item_kind||(s.metadata.kind??s.metadata.taskKind)===r.item_kind));
      const done=(s:RuleSignal)=>["completed","done"].includes(String(s.metadata.status)),rate=tasks.length?tasks.filter(done).length/tasks.length:1;
      let misses=0;for(const s of tasks) {if(done(s)) break;if(["missed","skipped"].includes(String(s.metadata.status))) misses++;}
      const barrier=tasks.find(s=>r.barrier_in?.includes(String(s.metadata.barrier)));
      const matched=!!barrier||(tasks.length>0&&((r.completion_rate_lt!==undefined&&rate<r.completion_rate_lt)||(r.missed_consecutive_gte!==undefined&&misses>=r.missed_consecutive_gte)));
      return out(matched,barrier?1:r.missed_consecutive_gte!==undefined?misses:rate*100,`${tasks.length} due items; ${(rate*100).toFixed(1)}% complete; ${misses} consecutive misses${barrier?"; configured barrier reported":""}`,tasks,barrier?"barrier":r.missed_consecutive_gte!==undefined?"consecutive_misses":"percent");
    }
    case "score": {
      const scores=all.filter(s=>s.kind==="responses"&&(!r.instrument_key||s.metadata.instrument===r.instrument_key)),latest=scores[0];
      if(!latest||Date.parse(latest.date)<now-r.window_days*86400000) return out(false,0,"No matching scored instrument in the configured window",[],"score");
      let matched=false,observed=latest.value,metric="score";
      if(r.item_flag) {const answer=Array.isArray(latest.metadata.answers)?latest.metadata.answers[r.item_flag.index-1]:undefined;matched=typeof answer==="number"&&compare(answer,r.item_flag.op,r.item_flag.value);observed=typeof answer==="number"?answer:0;metric=`item_${r.item_flag.index}`;}
      if(r.band_in?.some(b=>b.toLowerCase()===String(latest.metadata.band??"").toLowerCase())) matched=true;
      const previous=r.compare_to==="baseline"?scores.at(-1):scores[1];
      if(r.change_from_prior_gte!==undefined&&previous&&previous!==latest) {observed=(latest.value-previous.value)*(r.change_direction==="decrease"?-1:1);matched ||=observed>=r.change_from_prior_gte;metric="score_change";}
      if(!r.item_flag&&!r.band_in&&r.change_from_prior_gte===undefined) matched=cmp(latest.value);
      return out(matched,observed,"Latest matching instrument evaluated using configured score, band, item or change criteria",[latest,...(previous?[previous]:[])],metric);
    }
    case "time_budget":
    case "device_days_at_risk": {
      const time=r.kind==="time_budget",target=evidence?.target??r.value??(time?20:16),short=Math.max(0,target-(time?evidence?.minutes??0:evidence?.deviceDays??0)),left=evidence?.daysLeft??0;
      const minimum=time?r.minutes_short_gte:r.shortfall_gte;
      const result=out(left<=r.days_left_lte&&short>0&&short>=minimum,short,`${short} ${time?"eligible minutes":"counted device days"} short for ${r.code??"target"}; ${left} days left; alert window ≤ ${r.days_left_lte}`,window.filter(s=>time?s.kind==="time"&&s.metadata.status==="committed":s.kind==="observations"&&s.metadata.valid!==false),time?"minutes":"device_days");
      return {...result,sourceIds:evidence?.sourceIds??result.sourceIds};
    }
  }
}
