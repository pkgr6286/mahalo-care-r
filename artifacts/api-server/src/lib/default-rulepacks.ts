import {bundledBillingCodes,type Code} from "./billing-engine";
import {RulepackSchema,type Rulepack} from "./program-policy-schema";

const parents:Record<string,string>={"99458":"99457","98981":"98980","99439":"99490","99437":"99491","99489":"99487","99425":"99424","99427":"99426","99494":"99492"};
const activities=["review_data","phone_call","video_visit","care_plan_update","care_coordination","patient_education","documentation"];
const convert=(code:Code,program:string)=>({
  cpt:code.cpt,kind:code.setup?"setup":code.days?"supply":code.block?"addon":"management",
  period:code.setup?"episode":code.days?"rolling_30":"calendar_month",max_units:code.cap??1,
  requires:{
    ...(code.setup?{device_setup_completed:true,education_documented:true}:{}),
    ...(code.days?{device_days_min:code.days}:{}),...(code.daysMax?{device_days_max:code.daysMax}:{}),
    ...(code.min?{minutes_min:code.min}:{}),
    ...(code.max?{minutes_max:Math.floor(code.max)}:{}),
    ...(code.live?{live_interactive_min:1}:{}),
    ...(code.block?{minutes_per_unit:code.block}:{}),
    ...(code.assessment?{initial_assessment:true,current_score:true}:{}),
    ...(code.complex?{complexity:true}:{}),...(code.cocm?{cocm_registry:true,consultant:true,current_score:true}:{}),
  },
  ...(code.block?{parent:parents[code.cpt],base_minutes:code.base}:{}),
  minutes_bucket:code.practitioner?"practitioner":"staff",family:code.cocm?"cocm":code.complex?"complex":"standard",
  applies_to:program==="RTM"&&code.days?"msk":"all",
});

/** Existing demonstration thresholds serialized as one validated, version-pinnable JSON grammar. */
export function bundledRulepack(program:string):Rulepack {
  if(!bundledBillingCodes[program]) throw new Error("Unsupported program");
  const codes=bundledBillingCodes[program]!.map(code=>convert(code,program));
  if(program==="RTM") for(const code of codes.filter(c=>c.applies_to==="msk")) codes.push({...code,cpt:code.cpt==="98985"?"98984":"98976",applies_to:"respiratory"});
  return RulepackSchema.parse({
    key:program,version:"2026.1-demo",effective_from:"2026-01-01",provisional:true,
    eligibility:{min_chronic_conditions:program==="CCM"?2:["PCM","RPM"].includes(program)?1:0,condition_min_duration_months:null,initiating_visit_required_within_months:null,required_consents:["program",...(["RPM","RTM"].includes(program)?["device_sharing"]:[])],device_requirement:program==="RPM"?"fda_cleared":program==="RTM"?"supported":"none"},
    data_counted:program==="RPM"?["device"]:["device","patient_reported"],
    therapeutic_streams:program==="RTM"?["pain","function","adherence","therapeutic_device"]:[],
    time_rules:{counts_for_management:{clinical_staff_general_supervision:["RN","LPN","MA","NP","PA","MD","DO",...(program==="RTM"?["PT","OT","SLP"]:[]),...(program==="BHI"?["LCSW","LMSW","LPC","LMHC","LMFT","PsyD","PhD"]:[])],practitioner_only:["MD","DO","NP","PA"]},activities,rounding:"none",exclusive_with_programs:program==="RPM"?["RTM"]:program==="RTM"?["RPM"]:[]},
    codes,concurrency:["RPM","RTM","CCM","PCM","BHI"].filter(p=>p!==program).map(withProgram=>({with:withProgram,rule:["RPM","RTM"].includes(program)&&["RPM","RTM"].includes(withProgram)?"exclusive_same_period":"allowed_no_shared_minutes"})),
    careplan_template_key:`${program.toLowerCase()}_default`,required_instruments:program==="BHI"?["phq9"]:[],
  });
}
