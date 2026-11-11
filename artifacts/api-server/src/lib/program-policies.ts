import {createHash} from "node:crypto";
import {eq,sql} from "drizzle-orm";
import {programPolicies,type ProgramPolicyRow} from "@workspace/db";
import {bundledRulepack} from "./default-rulepacks";
import {AppError} from "./errors";
import {RulepackSchema,PolicyInputSchema,CareplanTemplateSchema,NoteTemplateSchema,PayerOverrideSchema,tightenRulepack,type Rulepack} from "./program-policy-schema";
import {allRecords,id,writeAudit,type Actor,type Store} from "./store";
import {planItems} from "./task-schedules";
import {clinicalPolicy} from "./datasets";

export const policyHash=(body:unknown):string=>{
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
  return createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex");
};
export const bundledPolicyId=(program:string)=>`bundled:${program}:2026.1-demo`;
export type SelectedRulepack={id:string;body:Rulepack;hash:string;payerPolicyId:string|null;payerVersion:string|null};
const dateNow=()=>new Date().toISOString().slice(0,10);

export function policyView(row:ProgramPolicyRow) {
  return {...row,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),reviewedAt:row.reviewedAt?.toISOString()??null,publishedAt:row.publishedAt?.toISOString()??null,retiredAt:row.retiredAt?.toISOString()??null,immutable:row.status!=="draft",fingerprint:policyHash(row.body),provisional:true};
}
export function bundledPolicyViews() {
  return ["RPM","RTM","CCM","PCM","BHI"].map(program=>{
    const body=bundledRulepack(program);
    return {id:bundledPolicyId(program),kind:"rulepack",program,version:body.version,payer:"",effectiveFrom:body.effective_from,status:"bundled",body,sourceRef:"Supplied specification / existing demonstration thresholds / VERIFY",reviewNote:"Bundled demonstration data, not clinically or CMS approved.",createdBy:"system",reviewedBy:null,reviewedAt:null,publishedAt:null,createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z",immutable:true,fingerprint:policyHash(body),provisional:true};
  });
}
export async function policyCatalog(s:Store) {return s.select().from(programPolicies).where(clinicalPolicy);}
export function choosePublished(rows:ProgramPolicyRow[],kind:string,program:string,asOf=dateNow(),payer="") {
  return rows.filter(r=>r.kind===kind&&r.program===program&&r.status==="published"&&r.effectiveFrom<=asOf&&r.payer.toLowerCase()===payer.toLowerCase())
    .sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||(b.publishedAt?.getTime()??0)-(a.publishedAt?.getTime()??0))[0];
}
export function selectRulepack(rows:ProgramPolicyRow[],program:string,pinnedId?:string,payer="",asOf=dateNow(),pinnedPayerId?:string|null):SelectedRulepack {
  let body:Rulepack,selectedId:string;
  if(pinnedId&&!pinnedId.startsWith("bundled:")) {
    const row=rows.find(r=>r.id===pinnedId&&r.kind==="rulepack"&&r.program===program&&["published","retired"].includes(r.status));
    if(!row) throw new AppError(409,"The enrollment's pinned program policy is unavailable");
    body=RulepackSchema.parse(row.body);selectedId=row.id;
  } else if(pinnedId) {
    if(pinnedId!==bundledPolicyId(program)) throw new AppError(409,"Unknown bundled policy version");
    body=bundledRulepack(program);selectedId=pinnedId;
  } else {
    const current=choosePublished(rows,"rulepack",program,asOf);
    body=current?RulepackSchema.parse(current.body):bundledRulepack(program);selectedId=current?.id??bundledPolicyId(program);
  }
  const overrides=rows.filter(r=>r.kind==="payer_override"&&(r.status==="published"||r.status==="retired"&&r.retiredAt&&r.retiredAt.toISOString().slice(0,10)>asOf)&&r.program===program&&r.payer.toLowerCase()===payer.toLowerCase()&&r.effectiveFrom<=asOf&&r.body.basePolicyId===selectedId)
    .sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||(b.publishedAt?.getTime()??0)-(a.publishedAt?.getTime()??0));
  const override=pinnedPayerId===null?undefined:pinnedPayerId?rows.find(r=>r.id===pinnedPayerId&&r.kind==="payer_override"&&r.program===program&&r.body.basePolicyId===selectedId&&["published","retired"].includes(r.status)):overrides[0];
  if(pinnedPayerId&&!override) throw new AppError(409,"The period's pinned payer policy is unavailable");
  if(override) body=tightenRulepack(body,PayerOverrideSchema.parse(override.body));
  return {id:selectedId,body,hash:policyHash(body),payerPolicyId:override?.id??null,payerVersion:override?.version??null};
}
export function normalizedPolicy(input:zPolicyInput,rows:ProgramPolicyRow[],allowDraftBase=false) {
  if(input.kind==="rulepack") {
    if(input.payer) throw new AppError(400,"Base rule packs are not payer-specific; use a payer override");
    const body=RulepackSchema.parse(input.body);
    if(body.key!==input.program||body.version!==input.version||body.effective_from!==input.effectiveFrom) throw new AppError(400,"Rule-pack program, version and effective date must match its envelope");
    return body;
  }
  if(input.kind==="payer_override") {
    if(!input.payer.trim()) throw new AppError(400,"A payer name is required for an override");
    const body=PayerOverrideSchema.parse(input.body);
    const draftBase=allowDraftBase?rows.find(r=>r.id===body.basePolicyId&&r.kind==="rulepack"&&r.program===input.program&&r.status==="draft"):undefined;
    const base=draftBase?{body:RulepackSchema.parse(draftBase.body)}:selectRulepack(rows,input.program,body.basePolicyId);
    try{tightenRulepack(base.body,body);}catch(error){throw new AppError(400,error instanceof Error?error.message:"Invalid payer tightening");}
    return body;
  }
  if(input.payer) throw new AppError(400,"Templates are program-wide, not payer-specific");
  if(input.kind==="careplan_template") {
    const body=CareplanTemplateSchema.parse(input.body);
    planItems({metadata:{items:body.items},program:input.program});
    return body;
  }
  const body=NoteTemplateSchema.parse(input.body);
  if(new Set(body.sections.map(s=>s.key)).size!==body.sections.length) throw new AppError(400,"Note section keys must be unique");
  return body;
}
type zPolicyInput=ReturnType<typeof PolicyInputSchema.parse>;
export async function createPolicy(s:Store,actor:Actor,raw:unknown,options:{importDraft?:boolean}={}) {
  await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
  const input=PolicyInputSchema.parse(raw),rows=await policyCatalog(s),body=normalizedPolicy(input,rows,options.importDraft===true);
  if(rows.some(r=>r.kind===input.kind&&r.program===input.program&&r.payer.toLowerCase()===input.payer.toLowerCase()&&r.version===input.version)) throw new AppError(409,"That policy version already exists");
  const [row]=await s.insert(programPolicies).values({...input,id:id(),body,createdBy:actor.id,status:"draft"}).returning();
  await writeAudit(s,actor,"create_policy",row!.id,null,{kind:input.kind,program:input.program,version:input.version,hash:policyHash(body)});
  return row!;
}
export async function pinnedPolicyUsage(s:Store,policyId:string) {
  return (await allRecords(s,"enrollments")).filter(r=>r.metadata.rulepackId===policyId).length;
}
export async function updatePolicy(s:Store,actor:Actor,policyId:string,raw:unknown) {
  await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
  const [current]=await s.select().from(programPolicies).where(eq(programPolicies.id,policyId)).for("update");
  if(!current) throw new AppError(404,"Policy not found");
  if(current.status!=="draft") throw new AppError(409,"Reviewed and published policies are immutable. Clone a new version.");
  const input=PolicyInputSchema.parse(raw),rows=await policyCatalog(s),body=normalizedPolicy(input,rows);
  if(rows.some(r=>r.id!==policyId&&r.kind===input.kind&&r.program===input.program&&r.payer.toLowerCase()===input.payer.toLowerCase()&&r.version===input.version)) throw new AppError(409,"That policy version already exists");
  const [updated]=await s.update(programPolicies).set({...input,body,updatedAt:new Date()}).where(eq(programPolicies.id,policyId)).returning();
  await writeAudit(s,actor,"update_policy",policyId,null,{hash:policyHash(body)});
  return updated!;
}
