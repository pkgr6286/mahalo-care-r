import { Router } from "express";
import { and,eq,inArray } from "drizzle-orm";
import { z } from "zod";
import { db,patients,patientContacts,users } from "@workspace/db";
import { authorize,assertPatientAccess } from "../lib/access";
import { allRecords,addRecord,getPatientRow,getRecord,writeAudit,type Actor } from "../lib/store";
import { caregiverRows,effectiveCaregiverGrant,requireCaregiverGrant,createCaregiverGrant,revokeCaregiverGrant } from "../lib/caregiver-access";
import { educationAvailable } from "../lib/content-review";
import { storedDocument } from "../lib/document-store";
import { AppError } from "../lib/errors";

export const caregiversRouter=Router();
caregiversRouter.use((_req,res,next)=>{res.set("Cache-Control","private, no-store");next();});
caregiversRouter.get("/patients/:id/caregivers",async(req,res)=>{
  const actor=res.locals.actor as Actor,patientId=String(req.params.id);
  authorize(actor,"clinical.read");await assertPatientAccess(actor,patientId);
  const [rows,contacts,accounts]=await Promise.all([caregiverRows(db,patientId),db.select().from(patientContacts).where(eq(patientContacts.patientId,patientId)),db.select({id:users.id,name:users.name,email:users.email,status:users.status}).from(users).where(eq(users.role,"caregiver"))]);
  res.json({grants:rows.map(effectiveCaregiverGrant),contacts:contacts.map(c=>({...c,eligibleAccount:accounts.find(u=>u.email.toLowerCase()===c.email.toLowerCase()&&["active","invited"].includes(u.status))??null}))});
});
caregiversRouter.post("/patients/:id/caregivers",async(req,res)=>{
  const result=await createCaregiverGrant(res.locals.actor as Actor,String(req.params.id),req.body);
  res.status(201).json(result);
});
caregiversRouter.post("/patients/:id/caregivers/:grantId/revoke",async(req,res)=>{
  res.json(await revokeCaregiverGrant(res.locals.actor as Actor,String(req.params.id),String(req.params.grantId),req.body));
});
caregiversRouter.get("/caregiver/patients",async(_req,res)=>{
  const actor=res.locals.actor as Actor;
  if(actor.role!=="caregiver")throw new AppError(403,"This portal is for family caregivers.");
  const grants=(await caregiverRows(db,undefined,actor.id)).map(r=>({patientId:r.grant.patientId,...effectiveCaregiverGrant(r)})).filter(g=>g.effectiveStatus==="active");
  const rows=grants.length?await db.select().from(patients).where(inArray(patients.id,grants.map(g=>g.patientId))):[];
  res.json({patients:rows.map(p=>({id:p.id,firstName:p.firstName,lastName:p.lastName,dob:p.dob,scopes:grants.find(g=>g.patientId===p.id)!.scopes}))});
});
caregiversRouter.get("/caregiver/patients/:id",async(req,res)=>{
  const actor=res.locals.actor as Actor,patientId=String(req.params.id),grant=await requireCaregiverGrant(actor,patientId),p=await getPatientRow(db,patientId);
  const all=await allRecords(),rs=all.filter(r=>r.patientId===patientId),can=(scope:string)=>grant.scopes.includes(scope);
  const identity=(r:typeof rs[number])=>({id:r.id,title:r.title,status:r.status,date:r.date,description:r.description});
  const messages=rs.filter(r=>r.kind==="messages"&&r.metadata.visibility!=="staff").slice(0,200),senders=messages.length?await db.select({id:users.id,name:users.name}).from(users).where(inArray(users.id,[...new Set(messages.map(r=>r.createdBy))])):[];
  await writeAudit(db,actor,"caregiver_read_shared_records",patientId,patientId,{grantId:grant.id,scopes:grant.scopes});
  res.json({
    patient:{id:p.id,firstName:p.firstName,lastName:p.lastName,dob:p.dob},scopes:grant.scopes,
    programs:can("careplans.read")?[...new Set(rs.filter(r=>r.kind==="enrollments"&&r.status==="active").map(r=>r.program).filter(Boolean))]:[],
    ...(can("careplans.read")?{careplans:rs.filter(r=>r.kind==="careplans"&&r.status==="active"&&r.metadata.signedAt).map(r=>({...identity(r),goals:r.metadata.goals??"",interventions:r.metadata.interventions??"",careTeam:r.metadata.careTeam??""}))}:{}),
    ...(can("readings.read")?{readings:rs.filter(r=>r.kind==="observations"&&!["voided","invalid","rejected","superseded"].includes(r.status)&&(r.status==="valid"||r.metadata.valid===true)).slice(0,200).map(r=>({...identity(r),value:r.value,unit:r.unit}))}:{}),
    ...(can("tasks.read")?{tasks:rs.filter(r=>r.kind==="tasks"&&r.metadata.audience!=="staff"&&!["cancelled","superseded"].includes(r.status)).slice(0,100).map(identity)}:{}),
    ...(can("messages.read")?{messages:messages.map(r=>({...identity(r),fromName:senders.find(s=>s.id===r.createdBy)?.name??"Care team"}))}:{}),
    ...(can("education.read")?{education:all.filter(r=>r.kind==="education"&&educationAvailable(r)).map(r=>({id:r.id,title:r.title,body:String(r.metadata.body??r.description)}))}:{}),
    ...(can("appointments.read")?{appointments:rs.filter(r=>r.kind==="interactions"&&r.metadata.channel==="video").slice(0,30).map(identity)}:{}),
  });
});
caregiversRouter.post("/caregiver/patients/:id/messages",async(req,res)=>{
  const actor=res.locals.actor as Actor,patientId=String(req.params.id),grant=await requireCaregiverGrant(actor,patientId,"messages.send");
  const {message}=z.object({message:z.string().trim().min(1).max(4000)}).parse(req.body);
  await db.transaction(s=>addRecord(s,"messages",{patientId,title:`Message from ${actor.name} · family caregiver`,description:message,status:"unread",metadata:{channel:"secure",direction:"inbound",senderRole:"caregiver",grantId:grant.id,reportedOnBehalfOfPatient:true}},actor));
  res.status(201).json({success:true});
});
caregiversRouter.get("/caregiver/patients/:id/careplans/:recordId/pdf",async(req,res)=>{
  const actor=res.locals.actor as Actor,patientId=String(req.params.id);
  await requireCaregiverGrant(actor,patientId,"careplans.read");
  const record=await getRecord(db,String(req.params.recordId),"careplans");
  if(record.patientId!==patientId||record.status!=="active"||!record.metadata.signedAt)throw new AppError(403,"Only the patient's released care plan may be downloaded.");
  const result=await storedDocument(record.id);
  await writeAudit(db,actor,"caregiver_read_careplan_pdf",record.id,patientId);
  res.set({"Content-Type":"application/pdf","Content-Disposition":'inline; filename="shared-care-plan.pdf"',"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}).send(result.pdfBytes);
});
