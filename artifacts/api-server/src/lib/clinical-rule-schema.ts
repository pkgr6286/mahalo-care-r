import {z} from "zod";
import {AppError} from "./errors";
export const clinicalRoles=["admin","clinical_admin","care_manager","behavioral_care_manager","psychiatric_consultant","billing_provider","therapist"] as const;
export const resolutionCodes=["contacted_patient","adjusted_plan","referred","false_positive","device_issue","no_action_needed"] as const;
const op=z.enum(["gt","gte","lt","lte","outside"]);
const condition=z.object({loinc:z.string().min(1).max(40),op,value:z.number().finite().optional(),low:z.number().finite().optional(),high:z.number().finite().optional()}).strict();
const schema=z.object({
  kind:z.enum(["threshold","trend","missing_data","adherence","score","device_days_at_risk","time_budget"]),
  legacy_key:z.literal("bp_critical").optional(),
  version:z.union([z.string().max(80),z.number().finite()]).transform(String).default("1"),
  loinc:z.string().min(1).max(40).optional(),op:op.default("gte"),value:z.number().finite().optional(),low:z.number().finite().optional(),high:z.number().finite().optional(),
  any_of:z.array(condition).min(1).max(10).optional(),
  confirm_with_n_readings:z.number().int().min(1).max(20).default(1),within_hours:z.number().positive().max(2160).default(24),
  window_days:z.number().int().min(1).max(365).default(7),stat:z.enum(["mean","slope","max","delta"]).default("mean"),min_points:z.number().int().min(1).max(1000).default(4),
  stream:z.enum(["device","epro","adherence"]).default("device"),days_without:z.number().positive().max(365).default(3),only_if_enrolled_days_gte:z.number().min(0).max(365).default(0),
  item_kind:z.string().max(80).optional(),completion_rate_lt:z.number().min(0).max(1).optional(),missed_consecutive_gte:z.number().int().min(1).max(365).optional(),barrier_in:z.array(z.string().min(1).max(100)).max(30).optional(),
  instrument_key:z.string().min(1).max(100).optional(),band_in:z.array(z.string().min(1).max(100)).min(1).max(20).optional(),
  change_from_prior_gte:z.number().positive().max(10000).optional(),change_direction:z.enum(["increase","decrease"]).default("increase"),compare_to:z.enum(["prior","baseline"]).default("prior"),
  item_flag:z.object({index:z.number().int().min(1).max(100),op:op.default("gt"),value:z.number().finite()}).strict().optional(),
  program_key:z.enum(["RPM","RTM","CCM","PCM","BHI"]).optional(),code:z.string().regex(/^[A-Z0-9]{5}$/).optional(),
  days_left_lte:z.number().int().min(0).max(365).default(7),shortfall_gte:z.number().min(0).max(366).default(1),minutes_short_gte:z.number().min(0).max(10000).default(1),
  owner_role:z.enum(clinicalRoles).optional(),escalate_after_hours:z.number().positive().max(8760).optional(),deduplication_window_minutes:z.number().int().min(1).max(525600).default(1440),
  notify:z.object({channels:z.array(z.enum(["in_app","push","sms","email"])).max(4).default(["in_app"]),quiet_period_minutes:z.number().int().min(0).max(10080).default(60),on_call_role:z.enum(clinicalRoles).optional(),critical_bypass_quiet:z.boolean().default(true)}).strict().default({}),
  provisional:z.literal(true).default(true),sourceRef:z.string().max(2000).optional(),reviewRequired:z.boolean().optional(),verified:z.boolean().optional(),
}).strict().superRefine((r,ctx)=>{
  const issue=(message:string,path:string[])=>ctx.addIssue({code:"custom",message,path});
  const validateComparison=(c:{op:string;value?:number;low?:number;high?:number},path:string[])=>{
    if(c.op==="outside"&&(c.low===undefined||c.high===undefined||c.low>=c.high)) issue("Outside comparisons require low < high",path);
    else if(c.op!=="outside"&&c.value===undefined) issue("A numeric comparison value is required",path);
  };
  if(r.kind==="threshold"||r.kind==="trend") {
    if(r.any_of&&r.kind==="threshold") r.any_of.forEach((c,i)=>validateComparison(c,["any_of",String(i)]));
    else validateComparison(r,["value"]);
  }
  if(r.kind==="score"&&!r.band_in&&!r.item_flag&&r.change_from_prior_gte===undefined) validateComparison(r,["value"]);
  if(r.kind==="adherence"&&r.completion_rate_lt===undefined&&!r.missed_consecutive_gte&&!r.barrier_in?.length) issue("Choose a completion rate, consecutive misses or barrier condition",["completion_rate_lt"]);
});
export type ClinicalRule=z.infer<typeof schema>;
export function parseClinicalRule(raw:Record<string,unknown>):ClinicalRule {
  const canonical={...raw};
  const aliases:Record<string,string>={threshold:raw.kind==="missing_data"?"days_without":"value",windowDays:"window_days",minPoints:"min_points",days:"days_without",rate:"completion_rate_lt",escalateAfterHours:"escalate_after_hours",ownerRole:"owner_role",owner:"owner_role"};
  if(raw.kind==="adherence"&&raw.threshold!==undefined) {
    delete canonical.threshold;
    if(raw.rate===undefined&&raw.completion_rate_lt===undefined&&raw.missed_consecutive_gte===undefined&&!raw.barrier_in) canonical.completion_rate_lt=0.5;
  }
  for(const [old,key] of Object.entries(aliases)) {
    if(canonical[old]!==undefined) {
      if(canonical[key]!==undefined&&JSON.stringify(canonical[key])!==JSON.stringify(canonical[old])) throw new AppError(400,`Conflicting rule fields: ${old} and ${key}`);
      canonical[key]=canonical[old];delete canonical[old];
    }
  }
  if(canonical.kind==="time_budget"&&canonical.value===undefined) canonical.value=20;
  if(canonical.kind==="device_days_at_risk"&&canonical.value===undefined) canonical.value=16;
  const parsed=schema.safeParse(canonical);
  if(!parsed.success) throw new AppError(400,`Rule definition: ${parsed.error.issues.map(i=>`${i.path.join(".")||"body"}: ${i.message}`).join("; ")}`);
  return parsed.data;
}
