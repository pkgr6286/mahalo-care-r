import {z} from "zod";
import type {RecordRow} from "@workspace/db";
import {fixtureEhrAdapter,type EhrIdentity} from "./ehr-adapter";
import {resolveFixtureEhrMatch} from "./ehr-matching";
import {getPatientRow,allRecords,addRecord,type Store,type Actor} from "./store";
const identitySchema=z.object({id:z.string(),mrn:z.string().optional(),firstName:z.string(),lastName:z.string(),dob:z.string()});
const inputSchema=z.object({demonstrateManualMatch:z.boolean().optional(),confirmation:z.object({confirmed:z.literal(true),candidateId:z.string().min(1).max(100),
  matchHash:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(20).max(2000)}).strict().optional()}).strict()
  .refine(v=>!(v.demonstrateManualMatch&&v.confirmation),"Generate the comparison before confirming it");
export const isEhrCache=(r:Pick<RecordRow,"kind"|"metadata">)=>r.kind==="interactions"&&["ehr_sync","ehr_match_pending"].includes(String(r.metadata.kind));
function cachedIdentity(r?:RecordRow):EhrIdentity|undefined {
  if(!r)return;
  const direct=identitySchema.safeParse(r.metadata.identity??r.metadata.candidateIdentity);
  if(direct.success)return direct.data;
  const resource=(Array.isArray(r.metadata.resources)?r.metadata.resources:[]).find(v=>v&&typeof v==="object"&&(v as Record<string,unknown>).resourceType==="Patient") as Record<string,unknown>|undefined;
  if(!resource)return;
  const name=(Array.isArray(resource.name)?resource.name[0]:{}) as Record<string,unknown>,identifier=(Array.isArray(resource.identifier)?resource.identifier[0]:{}) as Record<string,unknown>;
  const parsed=identitySchema.safeParse({id:resource.id,mrn:identifier?.value,firstName:Array.isArray(name?.given)?name.given.join(" "):"",lastName:name?.family,dob:resource.birthDate});
  if(parsed.success)return parsed.data;
  return undefined;
}
export async function syncFixtureEhr(s:Store,actor:Actor,patientId:string|undefined,payload:Record<string,unknown>) {
  const input=inputSchema.parse(payload),p=await getPatientRow(s,patientId),rs=await allRecords(s);
  const history=rs.filter(r=>r.patientId===p.id&&isEhrCache(r)).sort((a,b)=>Number(b.metadata.cacheSequence??0)-Number(a.metadata.cacheSequence??0)||b.createdAt.getTime()-a.createdAt.getTime()),previous=history[0];
  const snapshot=await fixtureEhrAdapter.read(p,rs);
  const identity=input.demonstrateManualMatch?{...snapshot.identity,mrn:`EHR-${p.mrn}`}:(cachedIdentity(previous)??snapshot.identity);
  const prior=previous?.metadata.matchConfirmation as Record<string,unknown>|undefined;
  const resolved=resolveFixtureEhrMatch(p,identity,input.confirmation,prior,input.demonstrateManualMatch===true),cacheSequence=Number(previous?.metadata.cacheSequence??0)+1;
  if(resolved.status!=="matched")return {message:resolved.status==="match_blocked"?"Date-of-birth conflict; no clinical resources were linked.":"Compare and explicitly confirm the identities; no clinical resources were linked.",
    record:await addRecord(s,"interactions",{title:"FHIR fixture · identity confirmation",patientId:p.id,status:resolved.status,
      description:"Read-only synthetic identity comparison. Clinical resources remain withheld until a valid human confirmation.",
      metadata:{kind:"ehr_match_pending",source:fixtureEhrAdapter.driver,cacheSequence,readOnly:true,resources:[],identity,candidateIdentity:identity,
        localIdentity:{id:p.id,mrn:p.mrn,firstName:p.firstName,lastName:p.lastName,dob:p.dob},matchHash:resolved.hash,demonstrationOnly:true,
        demonstrateManualMatch:input.demonstrateManualMatch===true||previous?.metadata.demonstrateManualMatch===true}},actor)};
  const resources=snapshot.resources.map(r=>r.resourceType==="Patient"?{...r,id:identity.id,identifier:identity.mrn?[{system:"https://example.test/synthetic-mrn",value:identity.mrn}]:[],
    name:[{family:identity.lastName,given:[identity.firstName]}],birthDate:identity.dob}:r);
  const matchConfirmation=resolved.reusePrior?prior:input.confirmation?{matchHash:resolved.hash,candidateId:identity.id,reason:input.confirmation.reason,
    confirmedById:actor.id,confirmedBy:actor.name,confirmedAt:new Date().toISOString(),reviewerRole:actor.role}:null;
  return {record:await addRecord(s,"interactions",{title:"FHIR R4 fixture sync",patientId:p.id,status:"completed",
    description:"Read-only synthetic FHIR R4 resource cache refreshed. No live EHR request or write-back was made.",
    metadata:{kind:"ehr_sync",source:fixtureEhrAdapter.driver,cacheSequence,identity,matchHash:resolved.hash,matchConfirmation,conditions:p.conditions,medications:p.medications,lastSync:new Date().toISOString(),
      resourceTypes:[...new Set(resources.map(r=>r.resourceType))],matchedBy:resolved.matchedBy,ehrPatientId:identity.id,resources,readOnly:true}},actor)};
}
