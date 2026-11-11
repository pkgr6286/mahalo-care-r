import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {AppError} from "./errors";
import {addRecord,allRecords,writeAudit,type Actor,type Store} from "./store";
import {bundledPolicyViews,createPolicy,policyCatalog} from "./program-policies";
import {PolicyInputSchema} from "./program-policy-schema";
import {validateReference} from "./reference-validation";

const kinds=["programs","templates","rules","locations","education","instruments"] as const;
const referenceSchema=z.object({id:z.string().max(120).optional(),kind:z.enum(kinds),title:z.string().trim().min(1).max(240),description:z.string().max(18000).default(""),program:z.string().max(20).nullable().optional(),status:z.string().max(40).optional(),metadata:z.record(z.unknown()).default({})}).strict();
const policySchema=PolicyInputSchema.extend({id:z.string().min(1).max(120),sourceStatus:z.string().optional()});
const inputSchema=z.object({version:z.union([z.literal(1),z.literal(2)]).default(1),format:z.literal("mahalo-care-configuration").optional(),dataClass:z.literal("synthetic").optional(),exportedAt:z.string().datetime().optional(),sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),records:z.array(referenceSchema).max(500),policies:z.array(policySchema).max(500).default([])}).strict();
function canonical(value:unknown,depth=0):unknown {
  if(depth>40)throw new AppError(400,"Configuration nesting exceeds the supported limit");
  if(Array.isArray(value))return value.map(v=>canonical(v,depth+1));
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>[key,canonical(v,depth+1)]));
  return value;
}
export const configurationHash=(value:unknown)=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export async function exportConfiguration(s:Store) {
  const references=await allRecords(s),policies=await policyCatalog(s);
  const body={version:2,format:"mahalo-care-configuration",dataClass:"synthetic",exportedAt:new Date().toISOString(),
    records:references.filter(r=>kinds.includes(r.kind as typeof kinds[number])&&!r.patientId).map(({id,kind,title,description,program,status,metadata})=>({id,kind,title,description,program,status,metadata})),
    policies:[...bundledPolicyViews(),...policies].map(({id,kind,program,version,payer,effectiveFrom,sourceRef,body,status})=>({id,kind,program,version,payer,effectiveFrom,sourceRef,body,sourceStatus:status}))};
  return {...body,sha256:configurationHash(body)};
}
export async function importConfiguration(s:Store,actor:Actor,raw:Record<string,unknown>) {
  if(raw.version===2) {
    const {sha256,...body}=raw;
    if(raw.format!=="mahalo-care-configuration"||raw.dataClass!=="synthetic"||typeof raw.exportedAt!=="string")throw new AppError(400,"Version 2 requires the exported format, data class and timestamp");
    if(typeof sha256!=="string"||configurationHash(body)!==sha256)throw new AppError(400,"Configuration checksum does not match; no records were imported");
  }
  const input=inputSchema.parse(raw);
  if(input.version===1&&input.policies.length)throw new AppError(400,"Versioned policies require a version 2 backup");
  const ids=input.policies.map(p=>p.id);
  if(new Set(ids).size!==ids.length)throw new AppError(400,"A backup cannot repeat a policy identifier");
  const mapping=new Map<string,string>(),policies=[];
  const ordered=[...input.policies].sort((a,b)=>Number(a.kind==="payer_override")-Number(b.kind==="payer_override"));
  for(const original of ordered) {
    const suffix=`.import.${randomUUID().slice(0,8)}`;
    const {id,sourceStatus,...p}=original,body=structuredClone(p.body),version=p.version.slice(0,40-suffix.length)+suffix;
    if(p.kind==="rulepack")body.version=version;
    if(p.kind==="payer_override") {
      const mapped=mapping.get(String(body.basePolicyId));
      if(!mapped)throw new AppError(400,"Import the base rule pack in the same backup before its payer override");
      body.basePolicyId=mapped;
    }
    const row=await createPolicy(s,actor,{...p,version,body,sourceRef:`${p.sourceRef.slice(0,1600)}\nImported source ${id}; backup ${input.sha256??"legacy"}; original state ${sourceStatus??"unknown"}. Review again locally.`},{importDraft:true});
    mapping.set(id,row.id);policies.push(row);
  }
  const imported=[];
  for(const raw of input.records) {
    // Foreign approvals, actor identity and publication claims never become local approval.
    const metadata={...raw.metadata,contentApprovedForUse:false,reviewedForPatients:false,importedFromId:raw.id??null,importedFromHash:input.sha256??null,requiresLocalReview:true};
    for(const key of ["reviewedBy","reviewedById","reviewedAt","approvedBy","approvedById","approvedAt","publishedAt","contentReviewedBy","contentReviewedById","contentReviewedAt","contentReviewHash"])delete (metadata as Record<string,unknown>)[key];
    validateReference(raw.kind,{...raw,metadata,status:"draft"});
    imported.push(await addRecord(s,raw.kind,{title:raw.title,description:raw.description,program:raw.program,status:"draft",metadata},actor));
  }
  await writeAudit(s,actor,"import_configuration","practice",null,{references:imported.length,policies:policies.length,sourceHash:input.sha256??null,activation:"none"});
  return {records:imported,message:`Imported ${imported.length} new draft references and ${policies.length} new draft policies. Existing records are unchanged; nothing was activated.`};
}
