import {createHash} from "node:crypto";
import {and,asc,eq,gt,gte,inArray,lt,sql} from "drizzle-orm";
import {audit,users,sessions,patients,datasetMemberships,type RecordRow} from "@workspace/db";
import {documentSourceHash} from "./document-renderer";
import {AppError} from "./errors";
import {inLocation} from "./access";
import type {Actor,Store} from "./store";

export const securityReportKinds=["access_review","audit_integrity","weekly_emergency_access"] as const;
export type SecurityReportKind=typeof securityReportKinds[number];
export const REPORT_TIME_ZONE="America/New_York";
export const MAX_AUDIT_ROWS=50_000;
export type AuditManifestItem={id:string;digest:string};
export const auditProjection={id:audit.id,actorId:audit.actorId,actorName:audit.actorName,action:audit.action,entityId:audit.entityId,patientId:audit.patientId,detail:audit.detail,at:sql<string>`to_char(${audit.at} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`};
export const auditChainStart=(period:string,timeZone:string)=>documentSourceHash({schema:"mahalo.audit-snapshot-chain.v1",period,timeZone});
export const auditChainStep=(previous:string,eventDigest:string)=>createHash("sha256").update(previous).update(eventDigest).digest("hex");
export function practiceDay(date=new Date(),timeZone=REPORT_TIME_ZONE){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date),get=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function currentSecurityPeriods(date=new Date(),timeZone=REPORT_TIME_ZONE){
  const day=practiceDay(date,timeZone),d=new Date(`${day}T12:00:00Z`),weekday=d.getUTCDay();
  d.setUTCDate(d.getUTCDate()-(weekday+6)%7);
  const month=day.slice(0,7),prior=new Date(`${month}-01T12:00:00Z`);prior.setUTCMonth(prior.getUTCMonth()-1);
  return {month,previousMonth:prior.toISOString().slice(0,7),weekStart:d.toISOString().slice(0,10),timeZone};
}
export function validateReportPeriod(kind:SecurityReportKind,period:string,timeZone:string){
  try{new Intl.DateTimeFormat("en-US",{timeZone}).format();}catch{throw new AppError(400,"Choose a valid IANA report timezone.");}
  if(kind==="weekly_emergency_access"){
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(period))throw new AppError(400,"Choose the Monday that starts the review week.");
    const d=new Date(`${period}T12:00:00Z`);
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==period||d.getUTCDay()!==1||period>practiceDay(new Date(),timeZone))throw new AppError(400,"Choose a real Monday no later than today.");
  }else if(!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(period)||period>practiceDay(new Date(),timeZone).slice(0,7))throw new AppError(400,"Choose a valid current or previous report month.");
}
async function bounds(s:Store,kind:SecurityReportKind,period:string,timeZone:string){
  const date=kind==="weekly_emergency_access"?period:`${period}-01`,duration=kind==="weekly_emergency_access"?"7 days":"1 month";
  const result=await s.execute(sql`SELECT ${date}::date::timestamp AT TIME ZONE ${timeZone} AS start, (${date}::date+${duration}::interval) AT TIME ZONE ${timeZone} AS finish`);
  // Drizzle's raw execute path leaves timestamptz strings un-mapped, unlike typed selects.
  const row=result.rows[0] as {start:string|Date;finish:string|Date};
  const start=row.start instanceof Date?row.start:new Date(row.start),finish=row.finish instanceof Date?row.finish:new Date(row.finish);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(finish.getTime()))throw new AppError(500,"The report's timezone boundaries could not be resolved.");
  return {start,finish};
}
async function excludedIdentities(s:Store){
  const rows=await s.select().from(datasetMemberships).where(and(inArray(datasetMemberships.entityType,["user","patient"]),inArray(datasetMemberships.dataset,["legacy","validation","validation_pending"])));
  return {users:new Set(rows.filter(r=>r.entityType==="user").map(r=>r.entityId)),patients:new Set(rows.filter(r=>r.entityType==="patient").map(r=>r.entityId))};
}
export async function securityReportData(s:Store,actor:Actor,kind:SecurityReportKind,period:string,timeZone:string,includeVerification=false){
  validateReportPeriod(kind,period,timeZone);
  const range=await bounds(s,kind,period,timeZone),generatedAt=new Date().toISOString(),scopeLocations=actor.role==="admin"?[]:actor.locationScopes??[];
  const base={schema:"mahalo.security-report.v1",kind,period,timeZone,generatedAt,generatedBy:{id:actor.id,name:actor.name},scopeLocations,includeVerification,range:{start:range.start.toISOString(),finish:range.finish.toISOString()}};
  if(kind==="audit_integrity"){
    const manifest:AuditManifestItem[]=[];let chainHead=auditChainStart(period,timeZone),cursor:{at:string;id:string}|undefined;
    while(true){
      const page=await s.select(auditProjection).from(audit).where(and(gte(audit.at,range.start),lt(audit.at,range.finish),cursor?sql`(${audit.at},${audit.id})>(${cursor.at}::timestamptz,${cursor.id})`:undefined)).orderBy(asc(audit.at),asc(audit.id)).limit(250);
      for(const event of page){if(manifest.length>=MAX_AUDIT_ROWS)throw new AppError(413,`This monthly snapshot exceeds ${MAX_AUDIT_ROWS.toLocaleString()} events; no partial report was retained.`);const digest=documentSourceHash(event);manifest.push({id:event.id,digest});chainHead=auditChainStep(chainHead,digest);}
      if(page.length<250)break;cursor={at:page.at(-1)!.at,id:page.at(-1)!.id};
    }
    return {...base,summary:{sourceRows:manifest.length,chainHead,includesRetainedHistory:true},auditSnapshot:{algorithm:"SHA-256 snapshot chain",chainHead,manifest,scope:"All immutable audit events in this period, including retained verification and legacy history",notice:"This is a captured-event checkpoint, not a continuous externally anchored database ledger. Events not in the manifest are outside this snapshot."}};
  }
  const excluded=await excludedIdentities(s),people=await s.select().from(users);
  if(kind==="access_review"){
    const activeSessions=await s.select({userId:sessions.userId,emergencyContext:sessions.emergencyContext}).from(sessions).where(and(gt(sessions.expiresAt,new Date()),gt(sessions.lastSeenAt,new Date(Date.now()-12*3600000))));
    const accounts=people.filter(u=>includeVerification||!excluded.users.has(u.id)).map(u=>({
      id:u.id,name:u.name,email:u.email,role:u.role,credential:u.credential,npi:u.npi,status:u.status,locationScopes:u.locationScopes,siteRoles:u.siteRoles,
      lastLoginAt:u.lastLoginAt?.toISOString()??null,lockedUntil:u.lockedUntil?.toISOString()??null,
      activeSessions:activeSessions.filter(r=>r.userId===u.id).length,
      emergencySessionsAtCapture:activeSessions.filter(r=>r.userId===u.id&&r.emergencyContext&&Date.parse(r.emergencyContext.expiresAt)>Date.now()).length,
    })).sort((a,b)=>a.name.localeCompare(b.name));
    return {...base,summary:{sourceRows:accounts.length,activeAccounts:accounts.filter(u=>u.status==="active").length,invitedAccounts:accounts.filter(u=>u.status==="invited").length,inactiveAccounts:accounts.filter(u=>u.status==="inactive").length,portalAccounts:accounts.filter(u=>["patient","caregiver"].includes(u.role)).length,missingProviderNpis:accounts.filter(u=>u.status==="active"&&["MD","DO","NP","PA"].includes(u.credential)&&!u.npi).length},accounts,notice:"Account assignments are an as-of-generation snapshot, not a reconstruction of historical roles. NPI formatting/checksum is not licensure verification. MFA is deferred in this email/password build."};
  }
  const events=await s.select(auditProjection).from(audit).where(and(gte(audit.at,range.start),lt(audit.at,range.finish),eq(audit.action,"break_glass"))).orderBy(asc(audit.at),asc(audit.id)).limit(MAX_AUDIT_ROWS+1);
  if(events.length>MAX_AUDIT_ROWS)throw new AppError(413,"This emergency review exceeds its bounded event limit; no partial report was retained.");
  const ends=await s.select(auditProjection).from(audit).where(and(gte(audit.at,range.start),lt(audit.at,new Date(range.finish.getTime()+4*3600000)),eq(audit.action,"end_break_glass")));
  const identities=await s.select({id:patients.id,firstName:patients.firstName,lastName:patients.lastName,mrn:patients.mrn,location:patients.location,dataset:patients.dataset}).from(patients);
  const emergencyAccess=events.filter(e=>includeVerification||!excluded.users.has(e.actorId)&&(!e.patientId||!excluded.patients.has(e.patientId))).flatMap(e=>{
    const p=identities.find(p=>p.id===e.patientId),location=String(e.detail.location??p?.location??"");
    if(!inLocation(actor,location))return [];
    const expiresAt=String(e.detail.expiresAt??""),end=ends.find(x=>x.patientId===e.patientId&&x.detail.sessionReference===e.detail.sessionReference&&x.at>=e.at&&Date.parse(x.at)<=Date.parse(expiresAt));
    return [{eventId:e.id,actorId:e.actorId,actorName:e.actorName,roleAtAccess:typeof e.detail.role==="string"?e.detail.role:null,credentialAtAccess:typeof e.detail.credential==="string"?e.detail.credential:null,
      patientId:e.patientId,patientName:String(e.detail.patientName??(p?`${p.firstName} ${p.lastName}`:"Identity retained in audit")),mrn:String(e.detail.mrn??p?.mrn??""),location,
      reason:String(e.detail.reason??""),openedAt:e.at,expiresAt,endedAt:end?.at??null,status:end?"ended":Date.parse(expiresAt)>Date.now()?"active":"expired",scope:String(e.detail.scope??"")}];
  });
  return {...base,summary:{sourceRows:emergencyAccess.length,uniqueStaff:new Set(emergencyAccess.map(e=>e.actorId)).size,uniquePatients:new Set(emergencyAccess.map(e=>e.patientId)).size,activeAtCapture:emergencyAccess.filter(e=>e.status==="active").length},emergencyAccess,notice:"Read-only access to one patient, limited to four hours. Status reflects this report's capture time. Outbound notices use the explicitly labelled local console until delivery is configured."};
}
export function reportPayload(record:Pick<RecordRow,"kind"|"metadata">){
  const body=record.metadata.securityReport;
  if(record.kind!=="security_reports"||!body||typeof body!=="object"||Array.isArray(body)||(body as Record<string,unknown>).schema!=="mahalo.security-report.v1")throw new AppError(409,"The sealed security-report snapshot is invalid.");
  return body as Record<string,unknown>;
}
