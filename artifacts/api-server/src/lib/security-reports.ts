import {and,asc,desc,eq,gte,inArray,lt,sql} from "drizzle-orm";
import {audit,db,documents,records,type DocumentRow,type RecordRow} from "@workspace/db";
import {addRecord,writeAudit,type Actor} from "./store";
import {captureDocument,documentInfo,storedDocument} from "./document-store";
import {documentSourceHash} from "./document-renderer";
import {assertClinicalSchema} from "./readiness";
import {AppError} from "./errors";
import {inLocation} from "./access";
import {clinicalRecord} from "./datasets";
import {securityReportData,reportPayload,auditProjection,auditChainStart,auditChainStep,MAX_AUDIT_ROWS,type SecurityReportKind} from "./security-report-data";

export function mayReadSecurityReport(actor:Actor,body:Record<string,unknown>){
  if(actor.role==="admin")return true;
  if(actor.role!=="clinical_admin"||body.kind!=="weekly_emergency_access")return false;
  const scope=Array.isArray(body.scopeLocations)?body.scopeLocations:[];
  return (!actor.locationScopes?.length||scope.length>0)&&scope.every(s=>typeof s==="string"&&inLocation(actor,s));
}
export function securityReportInfo(body:Record<string,unknown>,d:Pick<DocumentRow,"id"|"recordId"|"sha256"|"sourceHash"|"size"|"createdAt">,digest:string){
  const summary=body.summary as Record<string,unknown>,by=body.generatedBy as Record<string,unknown>;
  return {id:d.recordId,documentId:d.id,kind:body.kind,period:body.period,timeZone:body.timeZone,createdAt:String(body.generatedAt),createdBy:String(by.name),
    digest,pdfSha256:d.sha256,sourceHash:d.sourceHash,sourceRows:Number(summary.sourceRows),summary,scopeLocations:body.scopeLocations??[],includeVerification:body.includeVerification===true,
    pdfUrl:`/api/operations/security-reports/${d.recordId}/pdf`,jsonUrl:`/api/operations/security-reports/${d.recordId}/json`};
}
export async function createSecurityReport(actor:Actor,kind:SecurityReportKind,period:string,timeZone:string,includeVerification=false,scheduled=false,scheduledKey?:string){
  if(actor.role!=="admin"&&(actor.role!=="clinical_admin"||kind!=="weekly_emergency_access"))throw new AppError(403,"This report requires practice administration access.");
  if(includeVerification&&actor.role!=="admin")throw new AppError(403,"Only practice administrators may include retained verification activity.");
  await assertClinicalSchema();
  const body=await db.transaction(s=>securityReportData(s,actor,kind,period,timeZone,includeVerification),{isolationLevel:"repeatable read",accessMode:"read only"});
  const digest=documentSourceHash(body),labels={access_review:"Monthly access review",audit_integrity:"Audit log integrity checkpoint",weekly_emergency_access:"Weekly emergency access review"};
  return db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    if(scheduledKey){
      const [prior]=await s.select({document:documents}).from(records).innerJoin(documents,eq(documents.recordId,records.id)).where(and(eq(records.kind,"security_reports"),sql`${records.metadata}->>'scheduledKey'=${scheduledKey}`)).limit(1);
      if(prior){const r=prior.document.sourceSnapshot.record as RecordRow,b=reportPayload(r);return securityReportInfo(b,prior.document,String(r.metadata.contentDigest));}
    }
    const record=await addRecord(s,"security_reports",{title:`${labels[kind]} · ${period}`,status:"sealed",description:kind==="audit_integrity"?"A retained snapshot chain over the period's immutable audit events. Newer events remain outside this checkpoint.":"Retained governance snapshot. Review the captured assignments and access events; this report does not certify clinical credentials.",metadata:{securityReport:body,contentDigest:digest,reportKind:kind,period,timeZone,capturedBy:scheduled?"Scheduled reporting (system)":actor.name,scheduled,scheduledKey:scheduledKey??null,version:1}},actor);
    const document=await captureDocument(s,actor,record,"security_report","sealed_report");
    await writeAudit(s,actor,"generate_security_report",record.id,null,{kind,period,contentDigest:digest,sourceRows:body.summary.sourceRows,scheduled,scopeLocations:body.scopeLocations});
    return securityReportInfo(body,document,digest);
  });
}
export async function readSecurityReport(actor:Actor,id:string){
  const [r]=await db.select().from(records).where(and(eq(records.id,id),eq(records.kind,"security_reports"),clinicalRecord));
  if(!r)throw new AppError(404,"Security report not found.");
  const [d]=await db.select().from(documents).where(eq(documents.recordId,id)).orderBy(desc(documents.version)).limit(1);
  if(!d)throw new AppError(409,"This security report has no retained private document.");
  const snapshot=d.sourceSnapshot,record=snapshot.record as RecordRow|undefined;
  if(!record||record.id!==id||documentSourceHash(snapshot)!==d.sourceHash)throw new AppError(409,"The retained security-report source does not match its integrity anchor.");
  const body=reportPayload(record),digest=String(record.metadata.contentDigest??"");
  if(documentSourceHash(body)!==digest)throw new AppError(409,"The captured security-report digest is invalid.");
  if(!mayReadSecurityReport(actor,body))throw new AppError(403,"This report is outside your governance scope.");
  return {record,document:d,body,digest,info:securityReportInfo(body,d,digest)};
}
export async function listSecurityReports(actor:Actor,options:{period?:string;kind?:string;page?:number;pageSize?:number}={}){
  if(!["admin","clinical_admin"].includes(actor.role))throw new AppError(403,"Governance reports are limited to practice and clinical administrators.");
  const scope=sql`${documents.sourceSnapshot}#>'{record,metadata,securityReport,scopeLocations}'`;
  const filters=[eq(records.kind,"security_reports"),clinicalRecord];
  if(options.period)filters.push(sql`${documents.sourceSnapshot}#>>'{record,metadata,securityReport,period}'=${options.period}`);
  if(options.kind)filters.push(sql`${documents.sourceSnapshot}#>>'{record,metadata,securityReport,kind}'=${options.kind}`);
  if(actor.role!=="admin"){
    filters.push(sql`${documents.sourceSnapshot}#>>'{record,metadata,securityReport,kind}'='weekly_emergency_access'`);
    if(actor.locationScopes?.length)filters.push(sql`jsonb_array_length(${scope})>0 AND ${scope}<@${JSON.stringify(actor.locationScopes)}::jsonb`);
  }
  const page=options.page??1,pageSize=options.pageSize??20;
  const [count]=await db.select({count:sql<number>`count(*)::int`}).from(records).innerJoin(documents,eq(documents.recordId,records.id)).where(and(...filters));
  const rows=await db.select({id:documents.id,recordId:records.id,sha256:documents.sha256,sourceHash:documents.sourceHash,size:documents.size,createdAt:documents.createdAt,
    body:sql<Record<string,unknown>>`jsonb_build_object('kind',${documents.sourceSnapshot}#>'{record,metadata,securityReport,kind}','period',${documents.sourceSnapshot}#>'{record,metadata,securityReport,period}','timeZone',${documents.sourceSnapshot}#>'{record,metadata,securityReport,timeZone}','generatedAt',${documents.sourceSnapshot}#>'{record,metadata,securityReport,generatedAt}','generatedBy',${documents.sourceSnapshot}#>'{record,metadata,securityReport,generatedBy}','summary',${documents.sourceSnapshot}#>'{record,metadata,securityReport,summary}','scopeLocations',${scope},'includeVerification',${documents.sourceSnapshot}#>'{record,metadata,securityReport,includeVerification}')`,
    digest:sql<string>`${documents.sourceSnapshot}#>>'{record,metadata,contentDigest}'`,
  }).from(records).innerJoin(documents,eq(documents.recordId,records.id)).where(and(...filters)).orderBy(desc(documents.createdAt)).limit(pageSize).offset((page-1)*pageSize);
  return {reports:rows.map(r=>securityReportInfo(r.body,r,r.digest)),total:Number(count!.count),page,pageSize};
}
export async function verifySecurityReport(actor:Actor,id:string){
  const sealed=await readSecurityReport(actor,id);
  await storedDocument(id,sealed.document.id); // Verifies the pinned private PDF bytes as well as metadata.
  const base={valid:true,frozenSourceValid:true,privatePdfValid:true,snapshotDigestValid:true,verificationScope:sealed.body.kind==="audit_integrity"?"audit_events":"retained_snapshot",capturedRows:sealed.info.sourceRows,missingRows:null as number|null,changedRows:null as number|null,chainMatches:null as boolean|null,currentRowCount:null as number|null,unlistedEvents:null as number|null,checkedAt:new Date().toISOString()};
  if(sealed.body.kind==="audit_integrity"){
    const snap=sealed.body.auditSnapshot as {chainHead:string;manifest:{id:string;digest:string}[]},range=sealed.body.range as {start:string;finish:string};
    if(!snap||!Array.isArray(snap.manifest)||snap.manifest.length!==sealed.info.sourceRows||snap.manifest.length>MAX_AUDIT_ROWS||!/^[a-f0-9]{64}$/.test(snap.chainHead)||snap.manifest.some(m=>typeof m.id!=="string"||!m.id||!/^[a-f0-9]{64}$/.test(m.digest))||new Set(snap.manifest.map(m=>m.id)).size!==snap.manifest.length)throw new AppError(409,"The captured event manifest is invalid.");
    let head=auditChainStart(String(sealed.body.period),String(sealed.body.timeZone)),foundInRange=0,missing=0,changed=0,currentCount=0;
    await db.transaction(async s=>{
      for(let offset=0;offset<snap.manifest.length;offset+=250){
        const part=snap.manifest.slice(offset,offset+250),live=await s.select(auditProjection).from(audit).where(inArray(audit.id,part.map(m=>m.id))),byId=new Map(live.map(r=>[r.id,r]));
        for(const item of part){
          const row=byId.get(item.id);
          if(!row){missing++;head=auditChainStep(head,"missing");continue;}
          if(Date.parse(row.at)>=Date.parse(range.start)&&Date.parse(row.at)<Date.parse(range.finish))foundInRange++;
          const digest=documentSourceHash(row);if(digest!==item.digest)changed++;
          head=auditChainStep(head,digest);
        }
      }
      const [current]=await s.select({count:sql<number>`count(*)::int`}).from(audit).where(and(gte(audit.at,new Date(range.start)),lt(audit.at,new Date(range.finish))));
      currentCount=Number(current!.count);
    },{isolationLevel:"repeatable read",accessMode:"read only"});
    base.missingRows=missing;base.changedRows=changed;base.currentRowCount=currentCount;base.unlistedEvents=currentCount-foundInRange;
    base.chainMatches=head===snap.chainHead;base.valid=base.chainMatches&&!missing&&!changed;
  }
  await writeAudit(db,actor,"verify_security_report",id,null,{valid:base.valid,missingRows:base.missingRows,changedRows:base.changedRows,unlistedEvents:base.unlistedEvents});
  return base;
}
