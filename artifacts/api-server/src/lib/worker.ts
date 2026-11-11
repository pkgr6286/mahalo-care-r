import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, jobs, ingestInbox, patients, type RecordRow } from "@workspace/db";
import { config } from "./config";
import { logger } from "./logger";
import { addRecord, allRecords, patchRecord, writeAudit, type Store } from "./store";
import { enqueueJob } from "./job-store";
import { processDeviceEvent, systemActor } from "./device-ingestion";
import { materializeTasks, markMissedTasks } from "./task-schedules";
import { runRules } from "./rules";
import {parseClinicalRule} from "./clinical-rule-schema";
import {notifyRuleMatch} from "./rule-notifications";
import {refreshTimeReminders} from "./time-reminders";
import {captureNotificationOutbox} from "./notification-outbox";

async function runJob(s:Store,kind:string,payload:Record<string,unknown>):Promise<Record<string,unknown>> {
  // Clinical job effects serialize with normal mutations; SKIP LOCKED protects queue claims across API replicas.
  await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
  if(kind==="device_ingest") return processDeviceEvent(s,String(payload.inboxId));
  if(kind==="patient_rules") return {signals:(await runRules(s,systemActor,{action:"evaluateRules",patientId:String(payload.patientId)})).length};
  const ps=await s.select().from(patients).where(eq(patients.status,"active"));
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

export function startWorker() {
  let stopped=false,busy=false;
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
      for(let i=0;i<8&&!stopped;i++) if(!await processNextJob()) break;
    } catch(error) {
      logger.error({errorType:error instanceof Error?error.name:"unknown"},"Background worker tick failed");
    } finally {busy=false;}
  };
  const timer=setInterval(()=>{current=tick();},config.WORKER_INTERVAL_MS);timer.unref();
  current=tick();
  return async()=>{stopped=true;clearInterval(timer);await current;};
}
