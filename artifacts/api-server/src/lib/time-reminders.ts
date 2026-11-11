import {users,patients,type RecordRow} from "@workspace/db";
import {sql} from "drizzle-orm";
import {hasPermission,inLocation} from "./access";
import {addRecord,allRecords,patchRecord,type Actor,type Store} from "./store";
import {staffRoleAt} from "./staff-identity";
import {clinicalAccount} from "./datasets";

export function uncommittedReminderDue(r:Pick<RecordRow,"kind"|"status"|"metadata"|"updatedAt">,clock=Date.now()) {
  if(r.kind!=="time"||!["running","draft"].includes(r.status))return false;
  const started=Date.parse(String(r.status==="running"?r.metadata.startedAt:r.metadata.endedAt??r.updatedAt.toISOString()));
  return Number.isFinite(started)&&clock-started>=15*60000;
}
export async function resolveTimeReminder(s:Store,actor:Actor,time:RecordRow) {
  if(time.kind!=="time"||!["committed","voided"].includes(time.status))return 0;
  const reminders=(await allRecords(s,"tasks")).filter(r=>r.metadata.source==="uncommitted_time"&&r.metadata.timeEntryId===time.id&&r.status!=="completed");
  for(const task of reminders)await patchRecord(s,task,{status:"completed",metadata:{...task.metadata,completedAt:new Date().toISOString(),resolvedTimeStatus:time.status}},actor,"resolve_time_reminder");
  return reminders.length;
}
export async function refreshTimeReminders(s:Store,actor:Actor,clock=Date.now(),timeId?:string) {
  await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
  const times=await allRecords(s,"time"),tasks=await allRecords(s,"tasks"),people=await s.select().from(users).where(clinicalAccount),ps=await s.select().from(patients);
  let created=0,resolved=0,reopened=0;
  for(const time of times) {
    if(timeId&&time.id!==timeId)continue;
    const prior=tasks.find(r=>r.metadata.source==="uncommitted_time"&&r.metadata.timeEntryId===time.id);
    if(["committed","voided"].includes(time.status)){if(prior&&prior.status!=="completed")resolved+=await resolveTimeReminder(s,actor,time);continue;}
    if(!uncommittedReminderDue(time,clock))continue;
    if(prior){if(prior.status!=="pending"){await patchRecord(s,prior,{status:"pending",metadata:{...prior.metadata,reopenedAt:new Date().toISOString()}},actor,"reopen_uncommitted_time_reminder");reopened++;}continue;}
    const parent=ps.find(p=>p.id===time.patientId);
    const owner=people.find(u=>{const role=parent&&staffRoleAt(u,parent.location);return u.id===time.metadata.userId&&u.status==="active"&&role&&hasPermission({...u,role},"time.write");});
    await addRecord(s,"tasks",{title:time.status==="running"?"Review running care timer":"Review uncommitted care time",patientId:time.patientId,program:time.program,status:"pending",severity:"low",
      description:"Review the actual care activity before committing, or discard the timer with a reason. This reminder never creates billable minutes.",
      assignee:owner?.name??"Clinical administrator",metadata:{audience:"staff",source:"uncommitted_time",kind:"time_review",timeEntryId:time.id,ownerUserId:owner?.id??null,ownerRole:owner&&parent?staffRoleAt(owner,parent.location):"clinical_admin",originalOwnerUserId:time.metadata.userId,ownerAccessReview:!owner,dueAt:new Date(clock).toISOString()}},actor);
    created++;
  }
  return {created,resolved,reopened};
}
