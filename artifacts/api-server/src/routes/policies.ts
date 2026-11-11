import {Router} from "express";
import {z} from "zod";
import {eq} from "drizzle-orm";
import {db,programPolicies} from "@workspace/db";
import {hasPermission} from "../lib/access";
import {AppError} from "../lib/errors";
import {writeAudit,type Actor} from "../lib/store";
import {policyView,bundledPolicyViews,policyCatalog,normalizedPolicy,policyHash,createPolicy,updatePolicy,pinnedPolicyUsage,selectRulepack} from "../lib/program-policies";
import {PolicyInputSchema,RulepackSchema,PayerOverrideSchema,tightenRulepack} from "../lib/program-policy-schema";
import {evaluateBilling} from "../lib/billing-engine";

export const policiesRouter=Router();
const actor=(res:{locals:Record<string,unknown>})=>res.locals.actor as Actor;
const transitionBody=z.object({reason:z.string().trim().min(10).max(2000)});
const reviewBody=z.object({note:z.string().trim().min(20).max(5000),sourceRef:z.string().trim().min(1).max(2000),attested:z.literal(true)});
policiesRouter.get("/policies",async(_req,res)=>{
  const who=actor(res),rows=await policyCatalog(db);
  res.json({items:[...bundledPolicyViews(),...rows.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()).map(policyView)],canManage:hasPermission(who,"admin"),canReview:hasPermission(who,"plans.sign")});
});
policiesRouter.get("/policies/:policyId",async(req,res)=>{
  const bundled=bundledPolicyViews().find(p=>p.id===req.params.policyId);
  if(bundled){res.json({...bundled,enrollmentCount:0});return;}
  const [row]=await db.select().from(programPolicies).where(eq(programPolicies.id,req.params.policyId));
  if(!row) throw new AppError(404,"Policy not found");
  res.json({...policyView(row),enrollmentCount:await pinnedPolicyUsage(db,row.id)});
});
policiesRouter.post("/policies/validate",async(req,res)=>{
  const input=PolicyInputSchema.parse(req.body),rows=await policyCatalog(db),body=normalizedPolicy(input,rows);
  const base=input.kind==="rulepack"?RulepackSchema.parse(body):input.kind==="payer_override"?tightenRulepack(selectRulepack(rows,input.program,PayerOverrideSchema.parse(body).basePolicyId).body,PayerOverrideSchema.parse(body)):null;
  const evidence=base?evaluateBilling({program:input.program,minutes:20,practitionerMinutes:30,deviceDays:16,liveInteractions:1,consent:true,consentTypes:["program","device_sharing"],eligibleDevice:true,instrumentsInPeriod:["phq9"],activePlan:true,setup:true,conditionCount:2,assessment:true,scoreInPeriod:true,cocm:false,initialMonth:true,hasConsultant:true,complexity:false,supplyWindowComplete:true},base):[];
  res.json({valid:true,body,warnings:["Provisional local demonstration policy. This validation does not verify CMS, payer rules or clinical appropriateness.","Preview uses fixed synthetic facts: 20 staff minutes, 30 practitioner minutes, 16 counted days and one live interaction."],evidence});
});
policiesRouter.post("/policies",async(req,res)=>{
  const row=await db.transaction(async s=>createPolicy(s,actor(res),req.body));
  res.status(201).json(policyView(row));
});
policiesRouter.patch("/policies/:policyId",async(req,res)=>{
  const row=await db.transaction(async s=>updatePolicy(s,actor(res),req.params.policyId,req.body));
  res.json(policyView(row));
});
policiesRouter.post("/policies/:policyId/review",async(req,res)=>{
  const input=reviewBody.parse(req.body),who=actor(res);
  const updated=await db.transaction(async s=>{
    const [row]=await s.select().from(programPolicies).where(eq(programPolicies.id,req.params.policyId)).for("update");
    if(!row) throw new AppError(404,"Policy not found");
    if(row.status!=="draft") throw new AppError(409,"Only a draft can be reviewed");
    normalizedPolicy(PolicyInputSchema.parse({kind:row.kind,program:row.program,version:row.version,payer:row.payer,effectiveFrom:row.effectiveFrom,sourceRef:row.sourceRef,body:row.body}),await policyCatalog(s));
    const [result]=await s.update(programPolicies).set({status:"reviewed",reviewNote:input.note,sourceRef:input.sourceRef,reviewedBy:who.id,reviewedAt:new Date(),updatedAt:new Date()}).where(eq(programPolicies.id,row.id)).returning();
    await writeAudit(s,who,"review_policy",row.id,null,{sourceRef:input.sourceRef,hash:policyHash(row.body),provisional:true});
    return result!;
  });
  res.json(policyView(updated));
});
policiesRouter.post("/policies/:policyId/publish",async(req,res)=>{
  const input=transitionBody.parse(req.body),who=actor(res);
  const updated=await db.transaction(async s=>{
    const [row]=await s.select().from(programPolicies).where(eq(programPolicies.id,req.params.policyId)).for("update");
    if(!row) throw new AppError(404,"Policy not found");
    if(row.status!=="reviewed"||!row.reviewedBy||!row.sourceRef) throw new AppError(409,"Record an explicit review and source before publishing");
    const [result]=await s.update(programPolicies).set({status:"published",publishedAt:new Date(),updatedAt:new Date()}).where(eq(programPolicies.id,row.id)).returning();
    await writeAudit(s,who,"publish_policy",row.id,null,{reason:input.reason,hash:policyHash(row.body),provisional:true,newEnrollmentsOnly:row.kind==="rulepack"});
    return result!;
  });
  res.json(policyView(updated));
});
policiesRouter.post("/policies/:policyId/retire",async(req,res)=>{
  const input=transitionBody.parse(req.body),who=actor(res);
  const updated=await db.transaction(async s=>{
    const [row]=await s.select().from(programPolicies).where(eq(programPolicies.id,req.params.policyId)).for("update");
    if(!row) throw new AppError(404,"Policy not found");
    if(row.status!=="published") throw new AppError(409,"Only a published policy can be retired");
    const [result]=await s.update(programPolicies).set({status:"retired",retiredAt:new Date(),updatedAt:new Date()}).where(eq(programPolicies.id,row.id)).returning();
    await writeAudit(s,who,"retire_policy",row.id,null,{reason:input.reason,pinnedEnrollmentsPreserved:true});
    return result!;
  });
  res.json(policyView(updated));
});
policiesRouter.post("/policies/:policyId/clone",async(req,res)=>{
  const input=z.object({version:z.string().min(1),effectiveFrom:z.string()}).parse(req.body),who=actor(res);
  const bundled=bundledPolicyViews().find(r=>r.id===req.params.policyId);
  const [stored]=bundled?[]:await db.select().from(programPolicies).where(eq(programPolicies.id,req.params.policyId));
  const source=bundled??stored;if(!source) throw new AppError(404,"Policy not found");
  const body=source.kind==="rulepack"?{...source.body,version:input.version,effective_from:input.effectiveFrom}:source.body;
  const row=await db.transaction(s=>createPolicy(s,who,{kind:source.kind,program:source.program,version:input.version,payer:source.payer,effectiveFrom:input.effectiveFrom,sourceRef:source.sourceRef,body}));
  res.status(201).json(policyView(row));
});
