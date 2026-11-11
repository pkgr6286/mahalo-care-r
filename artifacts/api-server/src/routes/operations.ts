import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { db, jobs, ingestInbox } from "@workspace/db";
import { EnqueueMaintenanceBody, RetryJobParams, SimulateDeviceWebhookBody, ListJobsResponse, ListIngestInboxResponse, SimulateDeviceWebhookResponse } from "@workspace/api-zod";
import { jobView, enqueueJob } from "../lib/job-store";
import { allRecords, getRecord, id, writeAudit, type Actor } from "../lib/store";
import { acceptDeviceEvent, inboxView, signDeviceEvent } from "../lib/device-ingestion";
import { AppError, requireValue } from "../lib/errors";

export const operationsRouter=Router();
export const deviceWebhookRouter=Router();
deviceWebhookRouter.post("/webhooks/devices/simulator",rateLimit({windowMs:60000,limit:120,validate:{xForwardedForHeader:false}}),async(req,res):Promise<void>=>{
  const raw=(req as typeof req & {rawBody?:Buffer}).rawBody;
  if(!raw) throw new AppError(400,"Raw webhook body is required");
  const row=await db.transaction(s=>acceptDeviceEvent(s,raw,req.get("x-mahalo-timestamp")??"",req.get("x-mahalo-signature")??""));
  res.status(202).json(SimulateDeviceWebhookResponse.parse(inboxView(row)));
});
operationsRouter.get("/operations/jobs",async(_req,res):Promise<void>=>{
  res.json(ListJobsResponse.parse((await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(100)).map(jobView)));
});
operationsRouter.post("/operations/jobs",async(req,res):Promise<void>=>{
  const {kind}=EnqueueMaintenanceBody.parse(req.body);
  const job=await enqueueJob(db,kind,`manual:${id()}`);
  await writeAudit(db,res.locals.actor as Actor,"enqueue_maintenance",job.id,null,{kind});
  res.status(201).json(jobView(job));
});
operationsRouter.post("/operations/jobs/:jobId/retry",async(req,res):Promise<void>=>{
  const {jobId}=RetryJobParams.parse(req.params);
  const row=await db.transaction(async s=>{
    const [old]=await s.select().from(jobs).where(eq(jobs.id,jobId)).for("update");
    const job=requireValue(old,"Job not found");
    if(job.status!=="failed") throw new AppError(409,"Only failed jobs can be retried");
    const [updated]=await s.update(jobs).set({status:"queued",attempts:0,error:null,finishedAt:null,runAt:new Date()}).where(eq(jobs.id,jobId)).returning();
    if(job.kind==="device_ingest") await s.update(ingestInbox).set({status:"received",error:null}).where(eq(ingestInbox.id,String(job.payload.inboxId)));
    await writeAudit(s,res.locals.actor as Actor,"retry_job",jobId);
    return updated!;
  });
  res.json(jobView(row));
});
operationsRouter.get("/operations/inbox",async(_req,res):Promise<void>=>{
  res.json(ListIngestInboxResponse.parse((await db.select().from(ingestInbox).orderBy(desc(ingestInbox.receivedAt)).limit(100)).map(inboxView)));
});
operationsRouter.post("/operations/device-simulate",async(req,res):Promise<void>=>{
  const input=SimulateDeviceWebhookBody.parse(req.body),device=await getRecord(db,input.deviceId,"devices");
  if(!device.metadata.serial||!device.patientId) throw new AppError(400,"Choose an assigned device with a serial number");
  if(device.program!=="RPM") throw new AppError(400,"This simulator currently emits blood pressure for RPM devices");
  const payload={eventId:id(),deviceSerial:String(device.metadata.serial),readings:[{loinc:"8480-6",value:input.pattern==="critical"?185:input.pattern==="invalid"?500:124,diastolic:input.pattern==="critical"?122:82,unit:"mmHg",measuredAt:new Date().toISOString()}]};
  const raw=Buffer.from(JSON.stringify(payload)),timestamp=String(Date.now()),signature=signDeviceEvent(timestamp,raw);
  const row=await db.transaction(s=>acceptDeviceEvent(s,raw,timestamp,signature,res.locals.actor as Actor));
  res.status(202).json(SimulateDeviceWebhookResponse.parse(inboxView(row)));
});
