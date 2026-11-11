import {Router} from "express";
import {db,patients} from "@workspace/db";
import {allRecords,getRecord,writeAudit,type Actor} from "../lib/store";
import {scopedRecords} from "../lib/access";
import {z} from "zod";
import {checkAiDraftText} from "../lib/ai-review";
export const aiRouter=Router();
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const measured=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
aiRouter.post("/ai/drafts/:id/check",async(req,res):Promise<void>=>{
  const input=z.object({finalText:z.string().trim().min(1).max(18000)}).strict().parse(req.body);
  const r=await getRecord(db,String(req.params.id),"drafts");
  await writeAudit(db,res.locals.actor as Actor,"check_ai_source_quantities",r.id,r.patientId,{textLength:input.finalText.length});
  res.setHeader("Cache-Control","private, no-store");res.json(checkAiDraftText(r,input.finalText));
});
aiRouter.get("/ai/review-metrics",async(_req,res):Promise<void>=>{
  const actor=res.locals.actor as Actor,since=new Date(Date.now()-30*86400000);
  const [rows,ps]=await Promise.all([allRecords(db,"drafts"),db.select().from(patients)]);
  const drafts=scopedRecords(actor,rows,ps).filter(r=>r.createdAt>=since);
  const accepted=drafts.filter(r=>r.status==="accepted"),rejected=drafts.filter(r=>r.status==="rejected");
  const editMeasured=accepted.filter(r=>measured(r.metadata.editRatio));
  const checks=drafts.map(r=>object(r.metadata.numericCheck)).filter(c=>measured(c.recognizedClaims)&&measured(c.supportedClaims));
  const recognized=checks.reduce((n,c)=>n+Number(c.recognizedClaims),0),supported=checks.reduce((n,c)=>n+Number(c.supportedClaims),0);
  const usage=drafts.map(r=>object(r.metadata.usage)).filter(u=>measured(u.total_tokens));
  const durations=drafts.map(r=>r.metadata.generationMs).filter(measured).sort((a,b)=>a-b);
  const names=[...new Set(drafts.map(r=>String(r.metadata.capability??"legacy_unknown")))].sort();
  const result={
    since:since.toISOString(),scope:actor.locationScopes?.length?"Your authorized locations":"All authorized practice locations",
    total:drafts.length,pending:drafts.filter(r=>r.status==="pending").length,accepted:accepted.length,rejected:rejected.length,
    acceptanceRate:accepted.length+rejected.length?accepted.length/(accepted.length+rejected.length):null,
    acceptedWithEditMetrics:editMeasured.length,editedAccepted:editMeasured.filter(r=>r.metadata.edited===true).length,
    meanEditRatio:editMeasured.length?editMeasured.reduce((n,r)=>n+Number(r.metadata.editRatio),0)/editMeasured.length:null,
    sourceCheckedDrafts:checks.length,unsupportedDrafts:checks.filter(c=>c.status==="needs_review").length,
    recognizedClaims:recognized,supportedClaims:supported,supportedClaimRate:recognized?supported/recognized:null,
    humanNumericExceptions:accepted.filter(r=>typeof r.metadata.numericOverrideReason==="string"&&r.metadata.numericOverrideReason.length>=20).length,
    tokenReportingDrafts:usage.length,totalTokens:usage.reduce((n,u)=>n+Number(u.total_tokens),0),
    medianGenerationMs:durations.length?(durations[Math.floor((durations.length-1)/2)]+durations[Math.floor(durations.length/2)])/2:null,
    capabilities:names.map(capability=>{const group=drafts.filter(r=>String(r.metadata.capability??"legacy_unknown")===capability);return {capability,total:group.length,pending:group.filter(r=>r.status==="pending").length,accepted:group.filter(r=>r.status==="accepted").length,rejected:group.filter(r=>r.status==="rejected").length};}),
    limitations:["Drafts created in the last 30 days; includes authorized inactive-patient history.","Source checks cover recognized numeric formats, not complete factual fidelity or clinical correctness.","Legacy drafts without frozen evidence or edit metrics are unmeasured, not assumed accurate.","Provider-reported token usage is not a cost estimate. Human acceptance never signs notes or commits time."],
  };
  await writeAudit(db,actor,"view_ai_review_metrics","practice",null,{draftCount:drafts.length});
  res.setHeader("Cache-Control","private, no-store");res.json(result);
});
