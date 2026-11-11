import {z} from "zod";

export const ProgramCodeSchema=z.enum(["RPM","RTM","CCM","PCM","BHI"]);
const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,"Use a real ISO calendar date");
const nonnegative=z.number().finite().nonnegative();
export const CodeRequiresSchema=z.object({
  device_setup_completed:z.boolean().optional(),education_documented:z.boolean().optional(),
  device_days_min:z.number().int().min(1).max(30).optional(),device_days_max:z.number().int().min(1).max(30).optional(),
  minutes_min:nonnegative.optional(),minutes_max:nonnegative.optional(),minutes_per_unit:z.number().positive().optional(),
  live_interactive_min:z.number().int().min(1).optional(),
  initial_assessment:z.boolean().optional(),current_score:z.boolean().optional(),
  cocm_registry:z.boolean().optional(),consultant:z.boolean().optional(),complexity:z.boolean().optional(),
}).strict().refine(r=>r.device_days_min===undefined||r.device_days_max===undefined||r.device_days_min<=r.device_days_max,"Minimum device days exceeds maximum")
  .refine(r=>r.minutes_min===undefined||r.minutes_max===undefined||r.minutes_min<=r.minutes_max,"Minimum minutes exceeds maximum");
export const PolicyCodeSchema=z.object({
  cpt:z.string().regex(/^(?:\d{5}|G\d{4})$/),
  kind:z.enum(["setup","supply","management","addon"]),
  period:z.enum(["episode","rolling_30","calendar_month"]),
  max_units:z.number().int().min(1).max(10000),
  requires:CodeRequiresSchema,
  excludes:z.array(z.string()).default([]),
  parent:z.string().optional(),
  base_minutes:nonnegative.optional(),
  minutes_bucket:z.enum(["staff","practitioner"]).default("staff"),
  family:z.enum(["standard","complex","cocm"]).default("standard"),
  applies_to:z.enum(["all","initial","subsequent","msk","respiratory"]).default("all"),
  disabled:z.boolean().default(false),
}).strict();
export const RulepackSchema=z.object({
  key:ProgramCodeSchema,
  version:z.string().min(1).max(40),
  effective_from:isoDate,
  provisional:z.literal(true),
  eligibility:z.object({
    min_chronic_conditions:z.number().int().min(0).max(20),
    condition_min_duration_months:z.number().int().min(1).nullable().default(null),
    initiating_visit_required_within_months:z.number().int().min(1).nullable().default(null),
    required_consents:z.array(z.enum(["program","device_sharing"])).min(1),
    device_requirement:z.enum(["none","supported","fda_cleared"]),
  }).strict(),
  data_counted:z.array(z.enum(["device","patient_reported","clinician"])),
  therapeutic_streams:z.array(z.enum(["pain","function","adherence","therapeutic_device"])).default([]),
  time_rules:z.object({
    counts_for_management:z.object({clinical_staff_general_supervision:z.array(z.string()).min(1),practitioner_only:z.array(z.string())}).strict(),
    activities:z.array(z.string()).min(1),
    rounding:z.literal("none"),
    exclusive_with_programs:z.array(ProgramCodeSchema),
  }).strict(),
  codes:z.array(PolicyCodeSchema).min(1).max(50),
  concurrency:z.array(z.object({with:ProgramCodeSchema,rule:z.enum(["exclusive_same_period","allowed_no_shared_minutes"])}).strict()),
  careplan_template_key:z.string().min(1),
  required_instruments:z.array(z.string()),
  consent_text:z.string().min(40).default("The synthetic demonstration program, possible cost sharing, data sharing, monitoring expectations and right to withdraw were explained. This local environment does not provide real care."),
}).strict().superRefine((pack,ctx)=>{
  const codes=new Set<string>();
  for(let i=0;i<pack.codes.length;i++) {
    const code=pack.codes[i];
    if(codes.has(code.cpt)) ctx.addIssue({code:"custom",path:["codes",i,"cpt"],message:"A code may appear once per policy"});
    codes.add(code.cpt);
    if(code.kind==="addon"&&(!code.parent||!code.requires.minutes_per_unit)) ctx.addIssue({code:"custom",path:["codes",i],message:"Add-ons require a parent and a complete minutes-per-unit block"});
    if(code.period!==(code.kind==="setup"?"episode":code.kind==="supply"?"rolling_30":"calendar_month")) ctx.addIssue({code:"custom",path:["codes",i,"period"],message:"Period must match the code kind"});
    if(code.kind==="supply"&&code.requires.device_days_min===undefined) ctx.addIssue({code:"custom",path:["codes",i,"requires"],message:"Supply requires a counted-day threshold"});
    if(code.kind==="management"&&code.requires.minutes_min===undefined) ctx.addIssue({code:"custom",path:["codes",i,"requires"],message:"Management requires a minute threshold"});
  }
  pack.codes.forEach((code,i)=>{
    if(code.parent&&!codes.has(code.parent)) ctx.addIssue({code:"custom",path:["codes",i,"parent"],message:"Parent must exist in this policy"});
    if(code.excludes.some(c=>!codes.has(c))) ctx.addIssue({code:"custom",path:["codes",i,"excludes"],message:"Excluded code must exist in this policy"});
  });
});
export type Rulepack=z.infer<typeof RulepackSchema>;

export const PayerOverrideSchema=z.object({
  basePolicyId:z.string().min(1),
  codes:z.array(z.object({
    cpt:z.string(),minutes_min:nonnegative.optional(),device_days_min:z.number().int().min(1).max(30).optional(),
    max_units:z.number().int().min(1).optional(),disabled:z.literal(true).optional(),live_interactive_min:z.number().int().min(1).optional(),
  }).strict()).min(1),
}).strict();
export type PayerOverride=z.infer<typeof PayerOverrideSchema>;
export function visitWithinCalendarMonths(visitDay:string,asOfDay:string,months:number) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(visitDay)||!Number.isFinite(Date.parse(visitDay))||new Date(visitDay).toISOString().slice(0,10)!==visitDay||visitDay>asOfDay) return false;
  const [year,month,day]=asOfDay.split("-").map(Number),first=new Date(Date.UTC(year!,month!-1-months,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  const cutoff=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day!,last))).toISOString().slice(0,10);
  return visitDay>=cutoff;
}

/** A payer may tighten the selected policy; it cannot invent codes, lower thresholds or expand units. */
export function tightenRulepack(base:Rulepack,override:PayerOverride):Rulepack {
  const pack=structuredClone(base);
  const seen=new Set<string>();
  for(const change of override.codes) {
    if(seen.has(change.cpt)) throw new Error("Duplicate payer code override");seen.add(change.cpt);
    const code=pack.codes.find(c=>c.cpt===change.cpt);
    if(!code) throw new Error("A payer override cannot add a CPT code");
    if(change.minutes_min!==undefined) {
      if(code.requires.minutes_min===undefined||change.minutes_min<code.requires.minutes_min) throw new Error("A payer cannot lower the base minute requirement");
      code.requires.minutes_min=change.minutes_min;
    }
    if(change.device_days_min!==undefined) {
      if(code.requires.device_days_min===undefined||change.device_days_min<code.requires.device_days_min) throw new Error("A payer cannot lower counted-day requirements");
      code.requires.device_days_min=change.device_days_min;
    }
    if(change.max_units!==undefined) {
      if(change.max_units>code.max_units) throw new Error("A payer cannot increase maximum units");
      code.max_units=change.max_units;
    }
    if(change.live_interactive_min!==undefined) code.requires.live_interactive_min=Math.max(code.requires.live_interactive_min??0,change.live_interactive_min);
    if(change.disabled) code.disabled=true;
  }
  for(const code of pack.codes) if(code.parent&&pack.codes.find(c=>c.cpt===code.parent)?.disabled) code.disabled=true;
  return RulepackSchema.parse(pack);
}

export const CareplanTemplateSchema=z.object({
  key:z.string().min(1),description:z.string().min(20),
  sections:z.record(z.unknown()),items:z.array(z.object({
    id:z.string().min(1),title:z.string().min(1),kind:z.enum(["checkin","reading","medication","exercise","education"]),
    rrule:z.string(),hour:z.number().int().min(0).max(23),windowMinutes:z.number().int().min(1).max(1440),
  }).strict()).default([]),
}).strict();
export const NoteTemplateSchema=z.object({
  key:z.string().min(1),title:z.string().min(1),
  sections:z.array(z.object({key:z.string().regex(/^[a-z][a-z0-9_]*$/),label:z.string().min(1),required:z.boolean()}).strict()).min(1).max(20),
}).strict();
export const PolicyInputSchema=z.object({
  kind:z.enum(["rulepack","payer_override","careplan_template","note_template"]),
  program:ProgramCodeSchema,version:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/),
  payer:z.string().max(120).default(""),effectiveFrom:isoDate,sourceRef:z.string().max(2000).default(""),
  body:z.record(z.unknown()),
}).strict();
