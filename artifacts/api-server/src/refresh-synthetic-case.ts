import {and,eq,sql} from "drizzle-orm";
import {db,pool,records,datasetMemberships} from "@workspace/db";
import {config} from "./lib/config";
import {seedClinicalPractice} from "./lib/seed-clinical-practice";
import {clinicalDemoCases} from "./lib/clinical-demo-cases";
import {writeAudit,type Actor} from "./lib/store";
import {UpdateRecordResponse} from "@workspace/api-zod";
import {clinicalRecord} from "./lib/datasets";

// Explicit local synthetic-data maintenance, never a production migration or startup task.
if(!process.argv.includes("--approve-synthetic-refresh")||config.NODE_ENV!=="development"||config.DATA_CLASS!=="synthetic")throw Error("Requires approved synthetic development refresh");
const corrected=clinicalDemoCases[20]!;
const replacements=[
  ["The patient is uncertain which inhaler is for maintenance and which is for symptom relief.",corrected.barrier],
  ["The patient described their current symptom pattern and reviewed the names and purpose of the inhalers on their prescribed list. No change to the prescription was made in this care-management contact.",corrected.recent],
  ["Arrange a respiratory-nurse follow-up to review the prescribed inhaler technique and the existing action plan.",corrected.next],
] as const;
function replace(value:unknown):unknown {
  if(typeof value==="string")return replacements.reduce((s,[from,to])=>s.replaceAll(from,to),value);
  if(Array.isArray(value))return value.map(replace);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)]));
  return value;
}
const actor:Actor={id:"demo-admin",name:"Synthetic scenario configuration",role:"admin",credential:"RN",email:"demo@mahalo.care"};
async function main(){
  const state=await seedClinicalPractice(),patientId=state.patientIds[20]!;
  const owned=await db.select().from(records).where(and(clinicalRecord,eq(records.patientId,patientId),sql`${records.metadata}->>'scenarioKey'='patient-21' AND ${records.metadata}->>'synthetic'='true'`));
  let mutable=0;
  for(const r of owned.filter(r=>!["notes","careplans"].includes(r.kind))){
    const description=replace(r.description) as string, title=replace(r.title) as string,metadata=replace(r.metadata) as Record<string,unknown>;
    if(description===r.description&&title===r.title&&JSON.stringify(metadata)===JSON.stringify(r.metadata))continue;
    await db.transaction(async s=>{
      const changed=await s.update(records).set({description,title,metadata,updatedAt:new Date()}).where(and(eq(records.id,r.id),eq(records.updatedAt,r.updatedAt))).returning({id:records.id});
      if(!changed.length)throw Error("Scenario changed concurrently; no overwrite performed");
      await writeAudit(s,actor,"clarify_synthetic_scenario",r.id,r.patientId,{synthetic:true,priorDescription:r.description,description,priorTitle:r.title,title,reason:"Heart-failure care-coordination wording; duration, ownership and clinical measurements unchanged"});
    });
    mutable++;
  }
  const base="http://localhost:80/api";
  const login=await fetch(base+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"provider@mahalo.care",password:"MahaloDemo2026!"})});
  if(!login.ok)throw Error("Normal synthetic provider sign-in failed");
  const pairs=login.headers.getSetCookie().map(v=>v.split(";")[0]!),cookie=pairs.join("; "),proof=decodeURIComponent(pairs.find(v=>v.startsWith("mahalo_csrf="))!.slice("mahalo_csrf=".length));
  async function call(path:string,body:unknown,method="POST"){
    const response=await fetch(base+path,{method,headers:{cookie,origin:"http://localhost","Content-Type":"application/json","x-csrf-token":proof},body:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok)throw Error(`${path} returned ${response.status}: ${JSON.stringify(data).slice(0,400)}`);
    return data;
  }
  let revised=0;
  try{
    for(const r of owned.filter(r=>(r.kind==="notes"&&r.status==="signed")||(r.kind==="careplans"&&r.status==="active"))){
      if(JSON.stringify(replace({description:r.description,metadata:r.metadata}))===JSON.stringify({description:r.description,metadata:r.metadata}))continue;
      const body={description:replace(r.description),expectedUpdatedAt:r.updatedAt.toISOString(),metadata:r.kind==="notes"?{sections:replace(r.metadata.sections),revisionReason:"Heart-failure care-coordination clarification"}:{barriers:corrected.barrier,revisionReason:"Heart-failure care-coordination clarification"}};
      const draft=UpdateRecordResponse.parse(await call(`/records/${r.kind}/${r.id}`,body,"PATCH"));
      if(draft.id===r.id)throw Error("Expected a retained document revision, not an overwritten original");
      await call("/actions",{action:r.kind==="notes"?"signNote":"signPlan",id:draft.id,payload:{expectedUpdatedAt:draft.updatedAt}});
      await db.transaction(async s=>{
        const where=and(eq(datasetMemberships.entityType,"record"),eq(datasetMemberships.entityId,r.id));
        const exists=await s.select({id:datasetMemberships.entityId}).from(datasetMemberships).where(where);
        const values={dataset:"legacy" as const,reason:"Superseded synthetic scenario wording; signed sources and history retained"};
        if(exists.length)await s.update(datasetMemberships).set(values).where(where);
        else await s.insert(datasetMemberships).values({entityType:"record",entityId:r.id,...values});
        await writeAudit(s,actor,"retain_superseded_synthetic_scenario",r.id,r.patientId,{replacementId:draft.id,synthetic:true});
      });
      revised++;
    }
  }finally{await call("/auth/logout",{});}
  console.log({patients:state.patientIds.length,distinctIncomingConversations:new Set(clinicalDemoCases.map(c=>c.incomingMessage)).size,mutableNarrativesClarified:mutable,signedRevisionsRetained:revised});
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Synthetic refresh failed");process.exitCode=1;}).finally(()=>pool.end());
