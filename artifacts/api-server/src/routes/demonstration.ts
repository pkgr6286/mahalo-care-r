import { Router } from "express";
import { and,eq,desc,sql } from "drizzle-orm";
import { db,settings,patients,jobs } from "@workspace/db";
import { enqueueJob } from "../lib/job-store";
import { writeAudit,type Actor } from "../lib/store";
import { authorize } from "../lib/access";
import { config } from "../lib/config";
import { AppError } from "../lib/errors";

export const demonstrationRouter=Router();
demonstrationRouter.get("/operations/demonstration-status",async(_req,res)=>{
  authorize(res.locals.actor as Actor,"admin");
  const [state]=await db.select().from(settings).where(eq(settings.id,"clinical-demonstration-v1"));
  const [count]=await db.select({count:sql<number>`count(*)::int`}).from(patients).where(eq(patients.dataset,"clinical"));
  const [job]=await db.select().from(jobs).where(eq(jobs.kind,"prepare_demonstration")).orderBy(desc(jobs.createdAt)).limit(1);
  res.json({prepared:!!state,patients:count?.count??0,documentsPending:state?.value.documentsPending===true,synthetic:true,preparing:!!job&&["queued","running","retry"].includes(job.status),error:job?.status==="failed"?"Preparation stopped. Review the failed preparation job in Operations.":null});
});
demonstrationRouter.post("/operations/prepare-demonstration",async(req,res)=>{
  const actor=res.locals.actor as Actor;authorize(actor,"admin");
  if(config.DATA_CLASS!=="synthetic"||req.body?.confirmation!=="PREPARE SYNTHETIC PRACTICE")throw new AppError(400,"Explicit synthetic-practice confirmation is required.");
  const job=await enqueueJob(db,"prepare_demonstration","clinical-demonstration-v1");
  if(job.status==="failed")await db.update(jobs).set({status:"queued",attempts:0,error:null,finishedAt:null,runAt:new Date()}).where(eq(jobs.id,job.id));
  await writeAudit(db,actor,"request_synthetic_practice_preparation",job.id,null,{preservesHistory:true});
  res.status(202).json({status:job.status==="completed"?"ready":"queued",jobId:job.id,message:"Preparation runs as a tracked background operation; refresh status until the private documents are ready."});
});
