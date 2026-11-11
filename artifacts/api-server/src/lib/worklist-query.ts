import {and,or,eq,inArray,ilike,sql,asc,type SQL} from "drizzle-orm";
import {db,patients,records,users,type PatientRow,type RecordRow} from "@workspace/db";
import {inLocation,rolePermissions} from "./access";
import {AppError} from "./errors";
import {serializeRecord,type Actor} from "./store";
import {localDay} from "./periods";
import {clinicalRoles} from "./clinical-rule-schema";
import type {WorklistKind,WorklistFilters} from "./worklist-filters";
import {registryDetails} from "./worklist-registry";

export async function installWorklistSupport() {
  await db.execute(sql`CREATE OR REPLACE FUNCTION care_safe_timestamp(value text) RETURNS timestamptz LANGUAGE plpgsql STABLE STRICT AS $$ BEGIN RETURN value::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$`);
}
const priority=sql<number>`CASE ${records.severity} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;
const due=sql<Date|null>`care_safe_timestamp(${records.metadata}->>'dueAt')`;
const owner=sql<string|null>`${records.metadata}->>'ownerRole'`;
const battery=sql<number|null>`CASE WHEN ${records.metadata}->>'battery' ~ '^[0-9]+([.][0-9]+)?$' THEN (${records.metadata}->>'battery')::numeric ELSE NULL END`;
const firstReadingMissing=sql<boolean>`NOT EXISTS (SELECT 1 FROM care_records o WHERE o.kind='observations' AND o.metadata->>'deviceId'=${records.id} AND o.metadata->>'valid' IS DISTINCT FROM 'false')`;
const anyEnrollment=sql<boolean>`EXISTS (SELECT 1 FROM care_records e WHERE e.kind='enrollments' AND e.patient_id=${patients.id} AND e.program=${records.program})`;
const currentEnrollment=sql<boolean>`EXISTS (SELECT 1 FROM care_records e WHERE e.kind='enrollments' AND e.patient_id=${patients.id} AND e.program=${records.program} AND e.status IN ('active','paused'))`;
const activeEnrollment=sql<boolean>`EXISTS (SELECT 1 FROM care_records e WHERE e.kind='enrollments' AND e.patient_id=${patients.id} AND e.program=${records.program} AND e.status='active')`;
const returnRequired=sql<boolean>`(${patients.status}<>'active' OR (${anyEnrollment} AND NOT ${currentEnrollment}))`;
const enrollmentNeeded=sql<boolean>`NOT ${anyEnrollment}`;
const latestReview=sql<Date|null>`(SELECT MAX(care_safe_timestamp(c.metadata->>'reviewedAt')) FROM care_records c WHERE c.patient_id=${patients.id} AND c.kind='interactions' AND c.status='completed' AND c.metadata->>'kind'='consultant_review')`;
const myself=(actor:Actor)=>or(sql`${records.metadata}->>'ownerUserId'=${actor.id}`,and(sql`${records.metadata}->>'ownerUserId' IS NULL`,eq(records.assignee,actor.name)))!;
const open=()=>inArray(records.status,["open","acknowledged"]);
const staffTask=sql<boolean>`(${records.metadata}->>'audience'='staff' OR (${records.metadata}->>'audience' IS DISTINCT FROM 'patient' AND ${records.metadata}->>'adherenceKind' IS NULL AND COALESCE(${records.metadata}->>'taskKind',${records.metadata}->>'type',${records.metadata}->>'kind','') NOT IN ('reading','checkin','med','medication','exercise','education')))`;
const deviceIssue=sql<boolean>`(${records.status} IN ('setup_required','offline','disconnected','return_required') OR ${battery}<20 OR ${battery}>100 OR (${records.metadata}?'battery' AND ${battery} IS NULL) OR (${records.status} IN ('assigned','active') AND (${returnRequired} OR ${enrollmentNeeded} OR (${activeEnrollment} AND ${firstReadingMissing} AND ${records.createdAt}<now()-interval '7 days'))))`;
const periodDaysLeft=sql<number>`(EXTRACT(DAY FROM date_trunc('month',timezone(${patients.timezone},now()))+interval '1 month - 1 day')-EXTRACT(DAY FROM timezone(${patients.timezone},now())))::int`;
const riskDaysLeft=sql<number>`CASE WHEN ${records.metadata}->>'codeKind'='supply' AND care_safe_timestamp(${records.metadata}->'supplyWindow'->>'endDayExclusive') IS NOT NULL THEN GREATEST(0,care_safe_timestamp(${records.metadata}->'supplyWindow'->>'endDayExclusive')::date-timezone(${patients.timezone},now())::date) ELSE ${periodDaysLeft} END`;
const riskShortfall=sql<number>`CASE WHEN ${records.metadata}->>'codeKind'='supply' THEN GREATEST(0,COALESCE((${records.metadata}->'requirements'->>'device_days_min')::numeric,0)-COALESCE((${records.metadata}->>'deviceDays')::numeric,0)) ELSE GREATEST(0,COALESCE((${records.metadata}->'requirements'->>'minutes_min')::numeric,0)-COALESCE((${records.metadata}->>'minutes')::numeric,0)) END`;
const safeLike=(value:string)=>`%${value.replace(/[\\%_]/g,"\\$&")}%`;
export async function worklistOptions(actor:Actor) {
  const siteRows=await db.selectDistinct({name:patients.location}).from(patients);
  const locationRows=await db.select({name:records.title}).from(records).where(eq(records.kind,"locations"));
  const locations=[...new Set([...siteRows,...locationRows].map(s=>s.name).filter(s=>inLocation(actor,s)))].sort();
  const staff=(await db.select({id:users.id,name:users.name,role:users.role,locationScopes:users.locationScopes}).from(users).where(eq(users.status,"active"))).filter(u=>u.role!=="patient"&&locations.some(site=>inLocation({role:u.role,locationScopes:u.locationScopes} as Actor,site)));
  return {locations,assignees:staff.map(({id,name,role})=>({id,name,role})),ownerRoles:[...clinicalRoles,"front_desk","billing","read_only"],programs:["RPM","RTM","CCM","PCM","BHI"]};
}
function viewPredicates(kind:WorklistKind,actor:Actor,f:WorklistFilters):SQL[] {
  const predicates:SQL[]=[];
  if(["my_exceptions","team_queue"].includes(kind)) {
    predicates.push(eq(records.kind,"exceptions"));
    if(f.status!=="all") predicates.push(f.status==="open"?open():inArray(records.status,["resolved","dismissed"]));
    if(kind==="my_exceptions") predicates.push(myself(actor));
  } else if(kind==="tasks"||kind==="due_today") {
    predicates.push(eq(records.kind,"tasks"),staffTask);
    if(f.status!=="all") predicates.push(f.status==="open"?inArray(records.status,["pending","open"]):inArray(records.status,["completed","cancelled","missed"]));
    if(kind==="due_today") predicates.push(sql`${due} IS NOT NULL AND timezone(${patients.timezone},${due})::date=timezone(${patients.timezone},now())::date`);
  } else if(kind==="unsigned") predicates.push(inArray(records.kind,["careplans","notes"]),eq(records.status,"draft"));
  else if(kind==="device_issues") predicates.push(eq(records.kind,"devices"),sql`${records.status} NOT IN ('returned','retired','inactive')`,deviceIssue);
  else if(kind==="cocm_registry") predicates.push(eq(records.kind,"enrollments"),eq(records.program,"BHI"),inArray(records.status,["active","paused"]),sql`${records.metadata}->>'cocm'='true'`);
  else {
    predicates.push(eq(records.kind,"billing"),eq(records.status,"blocked"),sql`${records.metadata}->>'period'=${f.period||new Date().toISOString().slice(0,7)}`,sql`COALESCE(${records.metadata}->>'codeKind','')<>'addon'`);
    // An excluded lower tier or alternative family is not a care gap when its peer qualifies.
    predicates.push(sql`NOT EXISTS (SELECT 1 FROM care_records b WHERE b.kind='billing' AND b.patient_id=${patients.id} AND b.program=${records.program} AND b.metadata->>'period'=${records.metadata}->>'period' AND b.metadata->>'met'='true' AND b.metadata->>'codeKind'=${records.metadata}->>'codeKind')`);
    predicates.push(sql`NOT (${records.metadata}->>'codeKind'='setup' AND EXISTS (SELECT 1 FROM care_records b WHERE b.kind='billing' AND b.patient_id=${patients.id} AND b.program=${records.program} AND b.status='approved' AND b.metadata->>'codeKind'='setup' AND b.metadata->>'enrollmentId'=${records.metadata}->>'enrollmentId'))`);
  }
  return predicates;
}
function itemFor(record:RecordRow,p:PatientRow,kind:WorklistKind) {
  const now=new Date(),today=localDay(now,p.timezone),[year,month,day]=today.split("-").map(Number);
  const minutes=Number(record.metadata.minutes??0),days=Number(record.metadata.deviceDays??0),requires=record.metadata.requirements&&typeof record.metadata.requirements==="object"?record.metadata.requirements as Record<string,unknown>:{};
  const issueReasons:string[]=[];
  if(kind==="device_issues") {
    if(["setup_required","offline","disconnected","return_required"].includes(record.status)) issueReasons.push(record.status.replaceAll("_"," "));
    if(record.metadata.battery!==undefined) {
      const raw=record.metadata.battery,level=Number(raw);if(raw===null||!["number","string"].includes(typeof raw)||!String(raw).match(/^[0-9]+([.][0-9]+)?$/)||!Number.isFinite(level)||level<0||level>100) issueReasons.push("Battery telemetry is invalid");else if(level<20) issueReasons.push("Battery below 20%");
    }
    if(p.status!=="active") issueReasons.push("Confirm equipment return for inactive patient");
  }
  const dueAt=typeof record.metadata.dueAt==="string"&&Number.isFinite(Date.parse(record.metadata.dueAt))?new Date(record.metadata.dueAt).toISOString():null;
  return {id:record.id,patientId:p.id,patientName:`${p.firstName} ${p.lastName}`,mrn:p.mrn,location:p.location,timezone:p.timezone,title:record.title,status:record.status,severity:record.severity,assignee:record.assignee,ownerRole:typeof record.metadata.ownerRole==="string"?record.metadata.ownerRole:null,program:record.program,record:serializeRecord(record,[p]),dueAt,ageHours:Math.max(0,(now.getTime()-record.createdAt.getTime())/3600000),daysLeft:kind==="at_risk"?new Date(Date.UTC(year!,month!,0)).getUTCDate()-day!:null,shortfall:kind==="at_risk"?Math.max(0,Number(requires.minutes_min??0)-minutes,Number(requires.device_days_min??0)-days):null,cpt:typeof record.metadata.cpt==="string"?record.metadata.cpt:null,issueReasons};
}
export async function queryWorklist(actor:Actor,kind:WorklistKind,filters:WorklistFilters,requestedPage:number) {
  const options=await worklistOptions(actor);
  if(filters.locations.some(site=>!options.locations.includes(site))) throw new AppError(403,"A selected location is outside your accessible locations");
  if(filters.ownerRole&&!Object.hasOwn(rolePermissions,filters.ownerRole)) throw new AppError(400,"Unknown owner role");
  if(filters.assignee&&!["me","unassigned"].includes(filters.assignee)&&!options.assignees.some(u=>u.id===filters.assignee)) throw new AppError(400,"The selected assignee is unavailable");
  if(kind==="device_issues") filters={...filters,includeInactive:true};
  if(kind==="at_risk"&&!filters.period) filters={...filters,period:new Date().toISOString().slice(0,7)};
  const predicates=viewPredicates(kind,actor,filters);
  if(actor.role!=="admin"&&actor.locationScopes?.length) predicates.push(inArray(patients.location,actor.locationScopes));
  if(!filters.includeInactive) predicates.push(eq(patients.status,"active"));
  if(filters.locations.length) predicates.push(inArray(patients.location,filters.locations));
  if(filters.program) predicates.push(eq(records.program,filters.program));
  if(filters.ownerRole) predicates.push(eq(owner,filters.ownerRole));
  if(filters.assignee==="me") predicates.push(myself(actor));
  else if(filters.assignee==="unassigned") predicates.push(eq(records.assignee,""),sql`${records.metadata}->>'ownerUserId' IS NULL`);
  else if(filters.assignee) {
    const target=options.assignees.find(a=>a.id===filters.assignee)!;
    predicates.push(or(sql`${records.metadata}->>'ownerUserId'=${target.id}`,and(sql`${records.metadata}->>'ownerUserId' IS NULL`,eq(records.assignee,target.name)))!);
  }
  if(filters.q) predicates.push(or(ilike(records.title,safeLike(filters.q)),ilike(patients.mrn,safeLike(filters.q)),sql`(${patients.firstName}||' '||${patients.lastName}) ILIKE ${safeLike(filters.q)}`)!);
  const where=and(...predicates),[count]=await db.select({total:sql<number>`count(*)::int`}).from(records).innerJoin(patients,eq(records.patientId,patients.id)).where(where);
  const total=count?.total??0,totalPages=Math.max(1,Math.ceil(total/filters.pageSize)),page=Math.min(requestedPage,totalPages);
  const order:SQL[]|ReturnType<typeof asc>[]=kind==="cocm_registry"?[sql`${latestReview} ASC NULLS FIRST`,asc(records.id)]:kind==="due_today"||kind==="tasks"?[sql`${due} ASC NULLS LAST`,priority,asc(records.id)]:kind==="at_risk"?[sql`${riskDaysLeft} ASC`,sql`${riskShortfall} DESC`,asc(records.id)]:kind==="unsigned"||kind==="device_issues"?[asc(records.createdAt),asc(records.id)]:kind==="team_queue"?[priority,sql`CASE WHEN ${records.assignee}='' THEN 0 ELSE 1 END`,asc(records.createdAt),asc(records.id)]:[priority,asc(records.createdAt),asc(records.id)];
  const rows=await db.select({record:records,patient:patients,firstReadingMissing:kind==="device_issues"?sql<boolean>`${firstReadingMissing} AND ${activeEnrollment}`:sql<boolean>`false`,returnRequired:kind==="device_issues"?returnRequired:sql<boolean>`false`,enrollmentNeeded:kind==="device_issues"?enrollmentNeeded:sql<boolean>`false`,riskDaysLeft:kind==="at_risk"?riskDaysLeft:sql<number>`0`,riskShortfall:kind==="at_risk"?riskShortfall:sql<number>`0`}).from(records).innerJoin(patients,eq(records.patientId,patients.id)).where(where).orderBy(...order).limit(filters.pageSize).offset((page-1)*filters.pageSize);
  const registry=kind==="cocm_registry"?await registryDetails(rows.map(r=>r.patient.id)):new Map();
  const items=rows.map(({record,patient,firstReadingMissing,returnRequired,enrollmentNeeded,riskDaysLeft,riskShortfall})=>{
    const item=itemFor(record,patient,kind);
    if(kind==="at_risk") {item.daysLeft=Number(riskDaysLeft);item.shortfall=Number(riskShortfall);}
    if(kind==="device_issues"&&firstReadingMissing&&Date.now()-record.createdAt.getTime()>=7*86400000) item.issueReasons.push("No device-linked valid reading after seven days");
    if(kind==="device_issues"&&returnRequired&&!item.issueReasons.some(r=>r.includes("return"))) item.issueReasons.push("Confirm equipment return after program discharge");
    if(kind==="device_issues"&&enrollmentNeeded&&patient.status==="active") item.issueReasons.push("Complete program enrollment before monitoring");
    return {...item,...registry.get(patient.id)};
  });
  return {kind,page,pageSize:filters.pageSize,total,totalPages,generatedAt:new Date().toISOString(),appliedFilters:filters,options,items};
}
