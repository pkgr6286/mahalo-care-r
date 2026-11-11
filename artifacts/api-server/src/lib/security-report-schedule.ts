import {and,eq,sql} from "drizzle-orm";
import {db,users,records} from "@workspace/db";
import {addRecord,type Actor,type Store} from "./store";
import {enqueueJob} from "./job-store";
import {clinicalAccount} from "./datasets";
import {staffContext} from "./staff-identity";
import {documentSourceHash} from "./document-renderer";
import {createSecurityReport} from "./security-reports";
import {currentSecurityPeriods,REPORT_TIME_ZONE,securityReportKinds,type SecurityReportKind} from "./security-report-data";
import {z} from "zod";
const reportingFields={id:users.id,name:users.name,email:users.email,role:users.role,credential:users.credential,npi:users.npi,locationScopes:users.locationScopes,siteRoles:users.siteRoles};
async function reportingPeople(s:Store){
  return s.select(reportingFields).from(users).where(and(eq(users.status,"active"),clinicalAccount,sql`NOT EXISTS (SELECT 1 FROM care_dataset_memberships d WHERE d.entity_type='user' AND d.entity_id=${users.id} AND d.dataset='validation_pending')`));
}
type ReportingUser=Awaited<ReturnType<typeof reportingPeople>>[number];
function scheduledActor(u:ReportingUser,location?:string):Actor{
  return {id:u.id,name:"Mahalo scheduled reporting (system)",email:u.email,credential:u.credential,npi:u.npi,baseRole:u.role,siteRoles:u.siteRoles,...staffContext(u,location)};
}
export async function queueDueSecurityReports(s:Store){
  const people=await reportingPeople(s),owner=people.filter(u=>u.role==="admin").sort((a,b)=>a.id.localeCompare(b.id))[0];
  if(!owner)throw new Error("An active practice administrator is required for retained scheduled reports.");
  const defaults=currentSecurityPeriods(),groups=new Map<string,{actorId:string;location?:string;scopes:string[];recipients:Set<string>}>();
  for(const u of people){
    const locations=Object.keys(u.siteRoles).length?Object.entries(u.siteRoles).filter(([,role])=>role==="clinical_admin").map(([site])=>site):u.role==="clinical_admin"?[undefined]:[];
    for(const location of locations){
      const actor=scheduledActor(u,location),scopes=[...actor.locationScopes??[]].sort(),key=documentSourceHash(scopes);
      const group=groups.get(key)??{actorId:u.id,location,scopes,recipients:new Set<string>()};
      group.recipients.add(u.id);groups.set(key,group);
    }
  }
  if(!groups.size)groups.set("practice-owner",{actorId:owner.id,scopes:[],recipients:new Set([owner.id])});
  let queued=0;
  for(const kind of ["access_review","audit_integrity"] as const){
    const period=kind==="access_review"?defaults.month:defaults.previousMonth,key=`security:${kind}:${period}:${REPORT_TIME_ZONE}`;
    await enqueueJob(s,"security_report",key,{kind,period,timeZone:REPORT_TIME_ZONE,actorId:owner.id,scopeLocations:[],recipients:[owner.id],scheduledKey:key});queued++;
  }
  for(const [scopeKey,g] of groups){
    // A weekly completed-period review; on-demand generation also covers the current week.
    const prior=new Date(`${defaults.weekStart}T12:00:00Z`);prior.setUTCDate(prior.getUTCDate()-7);
    const period=prior.toISOString().slice(0,10),key=`security:weekly:${period}:${scopeKey}`;
    await enqueueJob(s,"security_report",key,{kind:"weekly_emergency_access",period,timeZone:REPORT_TIME_ZONE,actorId:g.actorId,location:g.location??null,scopeLocations:g.scopes,recipients:[...g.recipients],scheduledKey:key});queued++;
  }
  return {scheduledTargets:queued,delivery:"local_console_only",practiceTimeZone:REPORT_TIME_ZONE};
}
const scheduledInput=z.object({kind:z.enum(securityReportKinds),period:z.string(),timeZone:z.string(),actorId:z.string(),location:z.string().nullable().optional(),scopeLocations:z.array(z.string()),recipients:z.array(z.string()),scheduledKey:z.string()});
export async function runScheduledSecurityReport(payload:Record<string,unknown>){
  const p=scheduledInput.parse(payload),people=await reportingPeople(db),user=people.find(u=>u.id===p.actorId);
  if(!user)return {skipped:true,reason:"The reporting custodian is no longer active."};
  const actor=scheduledActor(user,p.location??undefined);
  if(documentSourceHash([...(actor.locationScopes??[])].sort())!==documentSourceHash([...p.scopeLocations].sort())||!["admin","clinical_admin"].includes(actor.role)||p.kind!=="weekly_emergency_access"&&actor.role!=="admin")return {skipped:true,reason:"The custodian no longer has the scheduled governance scope."};
  const report=await createSecurityReport(actor,p.kind,p.period,p.timeZone,false,true,p.scheduledKey);
  const recipients=people.filter(u=>p.recipients.includes(u.id));
  await db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    const [existing]=await s.select({id:records.id}).from(records).where(and(eq(records.kind,"notifications"),sql`${records.metadata}->>'securityReportId'=${report.id}`)).limit(1);
    if(!existing)await addRecord(s,"notifications",{title:p.kind==="weekly_emergency_access"?"Weekly emergency-access review ready":"Monthly governance review ready",description:`A retained ${p.period} report is ready in Access governance. Delivery is captured in the local console, not sent externally.`,status:"pending",metadata:{audience:"staff",channel:"email",recipientIds:recipients.map(u=>u.id),recipientEmails:recipients.map(u=>u.email),securityReportId:report.id,reportKind:p.kind,period:p.period,driver:"console",deliveredExternally:false}},actor);
  });
  return {reportId:report.id,kind:p.kind,period:p.period,recipients:recipients.length,delivery:"local_console_only"};
}
