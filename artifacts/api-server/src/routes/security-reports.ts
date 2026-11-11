import {Router,type Response} from "express";
import rateLimit from "express-rate-limit";
import {z} from "zod";
import {db} from "@workspace/db";
import {AppError} from "../lib/errors";
import {writeAudit,type Actor} from "../lib/store";
import {storedDocument,documentInfo} from "../lib/document-store";
import {createSecurityReport,listSecurityReports,readSecurityReport,verifySecurityReport} from "../lib/security-reports";
import {currentSecurityPeriods,REPORT_TIME_ZONE,securityReportKinds} from "../lib/security-report-data";
export const securityReportsRouter=Router();
function governanceActor(res:Response){
  const actor=res.locals.actor as Actor;
  if(!["admin","clinical_admin"].includes(actor.role))throw new AppError(403,"Governance reports require practice or clinical administration access.");
  res.setHeader("Cache-Control","private, no-store");return actor;
}
const generateLimit=rateLimit({windowMs:60000,limit:10,keyGenerator:(_req,res)=>String(res.locals.actor.id),validate:{xForwardedForHeader:false}});
const generateBody=z.object({kind:z.enum(securityReportKinds),period:z.string().min(7).max(10).optional(),timeZone:z.string().min(1).max(100).refine(v=>{try{new Intl.DateTimeFormat("en-US",{timeZone:v}).format();return true;}catch{return false;}},"Choose a valid IANA report timezone.").default(REPORT_TIME_ZONE),includeVerification:z.boolean().default(false)}).strict();
securityReportsRouter.get("/operations/security-overview",(_req,res)=>{
  const actor=governanceActor(res);
  res.json({defaults:currentSecurityPeriods(),reportKinds:actor.role==="admin"?[...securityReportKinds]:["weekly_emergency_access"],locationScopes:actor.locationScopes??[],isPracticeAdmin:actor.role==="admin"});
});
securityReportsRouter.get("/operations/security-reports",async(req,res)=>{
  const actor=governanceActor(res),options=z.object({period:z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])(?:-\d{2})?$/).optional(),kind:z.enum(securityReportKinds).optional(),page:z.coerce.number().int().min(1).max(10000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20)}).parse(req.query);
  res.json(await listSecurityReports(actor,options));
});
securityReportsRouter.post("/operations/security-reports",generateLimit,async(req,res)=>{
  const actor=governanceActor(res),body=generateBody.parse(req.body),defaults=currentSecurityPeriods(new Date(),body.timeZone);
  const period=body.period??(body.kind==="weekly_emergency_access"?defaults.weekStart:defaults.month);
  res.status(201).json(await createSecurityReport(actor,body.kind,period,body.timeZone,body.includeVerification));
});
securityReportsRouter.get("/operations/security-reports/:id",async(req,res)=>{
  const actor=governanceActor(res),sealed=await readSecurityReport(actor,String(req.params.id)),snapshot=sealed.body;
  await writeAudit(db,actor,"read_security_report",sealed.info.id,null,{kind:snapshot.kind,period:snapshot.period});
  const audit=snapshot.auditSnapshot as Record<string,unknown>|undefined;
  res.json({report:sealed.info,notice:snapshot.notice??audit?.notice??null,accounts:snapshot.accounts??null,emergencyAccess:snapshot.emergencyAccess??null,auditIntegrity:audit?{algorithm:audit.algorithm,chainHead:audit.chainHead,scope:audit.scope,notice:audit.notice}:null});
});
securityReportsRouter.post("/operations/security-reports/:id/verify",generateLimit,async(req,res)=>{
  res.json(await verifySecurityReport(governanceActor(res),String(req.params.id)));
});
securityReportsRouter.get("/operations/security-reports/:id/pdf",async(req,res)=>{
  const actor=governanceActor(res),sealed=await readSecurityReport(actor,String(req.params.id)),d=await storedDocument(sealed.info.id,sealed.document.id);
  await writeAudit(db,actor,"download_security_report_pdf",sealed.info.id,null,{documentId:d.id,sha256:d.sha256});
  res.setHeader("Content-Disposition",`attachment; filename="mahalo-${sealed.body.kind}-${sealed.body.period}.pdf"`);
  res.setHeader("X-Document-SHA256",d.sha256);res.setHeader("X-Source-SHA256",d.sourceHash);
  res.type("application/pdf").send(d.pdfBytes);
});
securityReportsRouter.get("/operations/security-reports/:id/json",async(req,res)=>{
  const actor=governanceActor(res),sealed=await readSecurityReport(actor,String(req.params.id));
  await writeAudit(db,actor,"download_security_report_json",sealed.info.id,null,{contentDigest:sealed.digest});
  res.setHeader("Content-Disposition",`attachment; filename="mahalo-${sealed.body.kind}-${sealed.body.period}.json"`);
  res.setHeader("X-Snapshot-SHA256",sealed.digest);
  res.json({schema:"mahalo.security-export.v1",contentDigest:sealed.digest,document:documentInfo(sealed.document),report:sealed.body});
});
