import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, jobs, ingestInbox, patients,settings,records, type RecordRow } from "@workspace/db";
import {randomUUID} from "node:crypto";
import { config } from "./config";
import { logger } from "./logger";
import { addRecord, allRecords, patchRecord, writeAudit, type Store } from "./store";
import { enqueueJob } from "./job-store";
import {seedClinicalPractice,retainClinicalDemoDocuments,calculateClinicalDemoBilling} from "./seed-clinical-practice";
import {clinicalPatient} from "./datasets";
import { processDeviceEvent, systemActor } from "./device-ingestion";
import { materializeTasks, markMissedTasks } from "./task-schedules";
import { runRules } from "./rules";
import {parseClinicalRule} from "./clinical-rule-schema";
import {notifyRuleMatch} from "./rule-notifications";
import {refreshTimeReminders} from "./time-reminders";
import {captureNotificationOutbox} from "./notification-outbox";
import {queueDueSecurityReports,runScheduledSecurityReport} from "./security-report-schedule";

async function runJob(s:Store,kind:string,payload:Record<string,unknown>):Promise<Record<string,unknown>> {
  // Report retention owns its transaction; do not hold the clinical mutation lock across it.
  if(kind==="security_report_schedule")return queueDueSecurityReports(s);
  if(kind==="security_report")return runScheduledSecurityReport(payload);
  if(kind==="prepare_demonstration") {
    await seedClinicalPractice();
    await retainClinicalDemoDocuments();
    return {...await calculateClinicalDemoBilling(),prepared:true,synthetic:true};
  }
  // Clinical job effects serialize with normal mutations; SKIP LOCKED protects queue claims across API replicas.
  await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
  if(kind==="device_ingest") return processDeviceEvent(s,String(payload.inboxId));
  if(kind==="patient_rules") return {signals:(await runRules(s,systemActor,{action:"evaluateRules",patientId:String(payload.patientId)})).length};
  const ps=await s.select().from(patients).where(and(eq(patients.status,"active"),clinicalPatient));
  if(kind==="rule_sweep") {
    let signals=0,escalations=0;
    for(const p of ps) signals+=(await runRules(s,systemActor,{action:"evaluateRules",patientId:p.id})).length;
    const rs=await allRecords(s);
    for(const e of rs.filter(r=>r.kind==="exceptions"&&r.status==="open"&&r.severity!=="critical")) {
      if(e.patientId&&!ps.some(p=>p.id===e.patientId)) continue;
      const rule=rs.find(r=>r.id===e.metadata.ruleId),hours=Number(rule?.metadata.escalate_after_hours??rule?.metadata.escalateAfterHours??0);
      if(!rule||rule.status!=="active") continue;
      if(hours>0&&Date.now()-e.createdAt.getTime()>=hours*3600000&&!e.metadata.escalatedAt) {
        const escalated=await patchRecord(s,e,{severity:e.severity==="low"?"medium":e.severity==="medium"?"high":"critical",metadata:{...e.metadata,escalatedAt:new Date().toISOString()}},systemActor,"escalate");
        if(rule) await patchRecord(s,escalated,{metadata:{...escalated.metadata,...await notifyRuleMatch(s,systemActor,escalated,parseClinicalRule(rule.metadata),true)}},systemActor,"escalation_notification");
        escalations++;
      }
    }
    return {patients:ps.length,signals,escalations};
  }
  if(kind==="task_materialize") {
    let created=0;
    for(const p of ps) created+=(await materializeTasks(s,systemActor,p.id)).length;
    return {patients:ps.length,created,missed:await markMissedTasks(s,systemActor)};
  }
  if(kind==="task_expiry") return {missed:await markMissedTasks(s,systemActor)};
  if(kind==="time_reminders")return refreshTimeReminders(s,systemActor);
  if(kind==="notifications") {
    return captureNotificationOutbox(s,ps);
  }
  throw new Error("Unsupported background job");
}
export async function processNextJob() {
  return db.transaction(async s=>{
    const [job]=await s.select().from(jobs).where(and(inArray(jobs.status,["queued","retry"]),lte(jobs.runAt,new Date()))).orderBy(asc(jobs.runAt),asc(jobs.createdAt)).limit(1).for("update",{skipLocked:true});
    if(!job) return false;
    const attempts=job.attempts+1;
    await s.update(jobs).set({status:"running",attempts}).where(eq(jobs.id,job.id));
    try {
      // Domain work has a savepoint: failed attempts never leave partial clinical mutations behind.
      const result=await s.transaction(inner=>runJob(inner,job.kind,job.payload));
      await s.update(jobs).set({status:"completed",finishedAt:new Date(),error:null,result}).where(eq(jobs.id,job.id));
      const failures=await s.select().from(records).where(and(eq(records.kind,"tasks"),eq(records.status,"pending"),eq(records.title,"Review failed background operation"),sql`${records.metadata}->>'jobId'=${job.id} AND ${records.metadata}->>'source'='system' AND ${records.metadata}->>'audience'='staff'`)).for("update");
      for(const task of failures)
        await patchRecord(s,task,{status:"completed",metadata:{...task.metadata,recoveredAt:new Date().toISOString(),recoveryReason:"The background operation completed successfully after retry."}},systemActor,"resolve_background_failure");
    } catch(error) {
      const terminal=attempts>=job.maxAttempts, message=error instanceof Error?error.message.slice(0,240):"Background operation failed";
      await s.update(jobs).set({status:terminal?"failed":"retry",attempts,error:message,runAt:new Date(Date.now()+2**attempts*1000),finishedAt:terminal?new Date():null}).where(eq(jobs.id,job.id));
      if(terminal) {
        if(job.kind==="device_ingest") await s.update(ingestInbox).set({status:"failed",error:message}).where(eq(ingestInbox.id,String(job.payload.inboxId)));
        await addRecord(s,"tasks",{title:"Review failed background operation",status:"pending",description:"An operation reached its retry limit. Review it in Administration → Operations.",metadata:{jobId:job.id,audience:"staff",source:"system"}},systemActor);
      }
      await writeAudit(s,systemActor,terminal?"job_failed":"job_retry",job.id,null,{kind:job.kind,attempts});
    }
    return true;
  });
}

export function startWorker(mode:"embedded"|"standalone"="embedded") {
  let stopped=false,busy=false;
  const instanceId=randomUUID();
  let beatBusy=false,heartbeat:Promise<void>=Promise.resolve();
  const pulse=async()=>{
    if(stopped||beatBusy)return;beatBusy=true;
    try {
      const value={seenAt:new Date().toISOString(),instanceId,mode};
      await db.insert(settings).values({id:"system.worker.heartbeat",value}).onConflictDoUpdate({target:settings.id,set:{value}});
    } catch(error) {logger.warn({errorType:error instanceof Error?error.name:"unknown"},"Worker heartbeat could not be recorded");}
    finally{beatBusy=false;}
  };
  const heartbeatTimer=setInterval(()=>{heartbeat=pulse();},15000);heartbeatTimer.unref();
  heartbeat=pulse();
  let current:Promise<void>=Promise.resolve();
  const tick=async()=>{
    if(stopped||busy) return;busy=true;
    try {
      const clock=new Date().toISOString();
      await enqueueJob(db,"rule_sweep",`hour:${clock.slice(0,13)}`);
      await enqueueJob(db,"task_materialize",`day:${clock.slice(0,10)}`);
      await enqueueJob(db,"task_expiry",`quarter:${Math.floor(Date.now()/900000)}`);
      await enqueueJob(db,"time_reminders",`time-reminders:${Math.floor(Date.now()/900000)}`);
      await enqueueJob(db,"notifications",`minute:${clock.slice(0,16)}`);
      await enqueueJob(db,"security_report_schedule",`security-schedule:${clock.slice(0,10)}`);
      for(let i=0;i<8&&!stopped;i++) if(!await processNextJob()) break;
    } catch(error) {
      logger.error({errorType:error instanceof Error?error.name:"unknown"},"Background worker tick failed");
    } finally {busy=false;}
  };
  const timer=setInterval(()=>{current=tick();},config.WORKER_INTERVAL_MS);timer.unref();
  current=tick();
  return async()=>{stopped=true;clearInterval(timer);clearInterval(heartbeatTimer);await Promise.all([current,heartbeat]);};
}
