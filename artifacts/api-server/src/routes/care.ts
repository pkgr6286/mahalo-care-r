import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, patients, records, audit, settings } from "@workspace/db";
import {
  CreatePatientBody, UpdatePatientBody, ListPatientsQueryParams, CreateRecordBody, UpdateRecordBody,
  PerformActionBody, UpdateSettingsBody, ListRecordsParams, CreateRecordParams,
  GetPatientParams, UpdateRecordParams, GetSettingsResponse,
} from "@workspace/api-zod";
import { allRecords, addRecord, patchRecord, getRecord, getPatientRow, id, writeAudit, patientView, serializeRecord, type Actor } from "../lib/store";
import { performAction } from "../lib/actions";
import { overview } from "../lib/overview";
import { AppError, requireValue } from "../lib/errors";
import { ingestReading } from "../lib/observations";

export const careRouter=Router();
const actor=(res:{locals:Record<string,unknown>})=>res.locals.actor as Actor;
const protectedKinds=["enrollments","consents","time","billing","responses","drafts","notifications","audit"];

careRouter.get("/dashboard",async (_req,res):Promise<void>=>{res.json((await overview()).dashboard);});
careRouter.get("/reports",async (_req,res):Promise<void>=>{res.json((await overview()).reports);});
careRouter.get("/patients",async (req,res):Promise<void>=>{
  const query=ListPatientsQueryParams.parse(req.query),rs=await allRecords(), ps=await db.select().from(patients).orderBy(patients.lastName);
  const who=actor(res);
  const filtered=ps.filter(p=>who.role!=="patient"||p.id===who.patientId).map(p=>patientView(p,rs)).filter(p=>
    (!query.search||`${p.firstName} ${p.lastName} ${p.mrn}`.toLowerCase().includes(query.search.toLowerCase()))&&
    (!query.program||p.programs.includes(query.program))&&(!query.status||p.status===query.status));
  res.json(filtered);
});
careRouter.post("/patients",async (req,res):Promise<void>=>{
  const input=CreatePatientBody.parse(req.body);validatePatient(input);
  const patient=await db.transaction(async s=>{
    const [p]=await s.insert(patients).values({...input,id:id(),mrn:`MC-${Date.now().toString(36).toUpperCase()}`}).returning();
    await writeAudit(s,actor(res),"create_patient",p!.id,p!.id);return p!;
  });
  res.status(201).json(patientView(patient,[]));
});
careRouter.get("/patients/:id",async (req,res):Promise<void>=>{
  const {id}=GetPatientParams.parse(req.params),p=await getPatientRow(db,id);
  const rs=await allRecords();
  await writeAudit(db,actor(res),"read_chart",id,id);
  const who=actor(res);
  const visible=rs.filter(r=>r.patientId===id&&(who.role!=="patient"||(["tasks","observations","responses","messages","devices","careplans","consents","enrollments"].includes(r.kind)&&!(r.kind==="careplans"&&r.status==="draft"))));
  res.json({patient:patientView(p,rs),records:visible.map(r=>serializeRecord(r,[p]))});
});
careRouter.patch("/patients/:id",async (req,res):Promise<void>=>{
  const {id}=GetPatientParams.parse(req.params),input=UpdatePatientBody.parse(req.body);validatePatient(input);
  await getPatientRow(db,id);
  const [p]=await db.update(patients).set({...input,updatedAt:new Date()}).where(eq(patients.id,id)).returning();
  await writeAudit(db,actor(res),"update_patient",id,id);
  res.json(patientView(p!,await allRecords()));
});
careRouter.get("/records/:kind",async (req,res):Promise<void>=>{
  const {kind}=ListRecordsParams.parse(req.params);
  if(kind==="audit") {
    const events=await db.select().from(audit).orderBy(desc(audit.at)).limit(500);
    res.json(events.map(e=>({id:e.id,kind:"audit",title:e.action.replaceAll("_"," "),description:e.actorName,patientId:e.patientId,patientName:"",status:"recorded",date:e.at.toISOString(),createdAt:e.at.toISOString(),updatedAt:e.at.toISOString(),metadata:{...e.detail,entityId:e.entityId,actor:e.actorName}})));return;
  }
  const [rs,ps]=await Promise.all([allRecords(db,kind),db.select().from(patients)]);
  const who=actor(res);
  const visible=rs.filter(r=>who.role!=="patient"||(r.patientId===who.patientId&&!(kind==="careplans"&&r.status==="draft"))||(["education","instruments"].includes(kind)&&!r.patientId));
  res.json(visible.map(r=>serializeRecord(r,ps)));
});
careRouter.post("/records/:kind",async (req,res):Promise<void>=>{
  const {kind}=CreateRecordParams.parse(req.params),input=CreateRecordBody.parse(req.body);
  if(protectedKinds.includes(kind)) throw new AppError(400,"Use the dedicated workflow action to create this record");
  if(["notes","careplans"].includes(kind)&&input.status&&input.status!=="draft") throw new AppError(400,"Clinical documents must be created as drafts");
  if(kind==="interactions"&&input.metadata?.isLiveTwoWay===true&&input.status!=="completed") throw new AppError(400,"Only completed interactions can count as live contact");
  const r=await db.transaction(async s=>kind==="observations"?ingestReading(s,input,actor(res)):addRecord(s,kind,{...input,status:["notes","careplans"].includes(kind)?"draft":input.status},actor(res)));
  res.status(201).json(serializeRecord(r,await db.select().from(patients)));
});
careRouter.patch("/records/:kind/:id",async (req,res):Promise<void>=>{
  const {kind,id}=UpdateRecordParams.parse(req.params),input=UpdateRecordBody.parse(req.body),old=await getRecord(db,id,kind);
  if(protectedKinds.includes(kind)) throw new AppError(400,"Use a workflow action to change this record");
  if(["notes","careplans"].includes(kind)&&input.status&&input.status!=="draft") throw new AppError(400,"Use the signing workflow to change document status");
  if(kind==="observations") throw new AppError(409,"Recorded observations are immutable; add a correction rather than overwriting");
  if(input.patientId&&input.patientId!==old.patientId) throw new AppError(400,"A clinical record cannot be moved to a different patient");
  const r=await db.transaction(async s=>{
    const metadata={...old.metadata,...input.metadata};
    if(["notes","careplans"].includes(kind)&&["active","signed","superseded","amended"].includes(old.status)) {
      if(old.kind==="notes") return addRecord(s,kind,{...input,patientId:old.patientId,program:old.program,status:"draft",metadata:{...metadata,priorVersionId:old.id,version:Number(old.metadata.version||1)+1,signedBy:null,signedAt:null}},actor(res));
      return addRecord(s,kind,{...input,patientId:old.patientId,program:old.program,status:"draft",metadata:{...metadata,priorVersionId:old.id,version:Number(old.metadata.version||1)+1,signedBy:null,signedAt:null}},actor(res));
    }
    if(old.kind==="exceptions"&&input.status&&input.status!==old.status) throw new AppError(400,"Use acknowledge, resolve or dismiss for exception transitions");
    return patchRecord(s,old,{...input,metadata},actor(res));
  });
  res.json(serializeRecord(r,await db.select().from(patients)));
});
careRouter.post("/actions",async (req,res):Promise<void>=>{
  const input=PerformActionBody.parse(req.body);
  const result=await performAction(actor(res),input);
  const ps=await db.select().from(patients);
  res.json({...result,record:result.record?serializeRecord(result.record,ps):undefined,records:result.records?.map(r=>serializeRecord(r,ps))});
});
careRouter.get("/settings",async (_req,res):Promise<void>=>{
  const [r]=await db.select().from(settings).where(eq(settings.id,"practice"));
  res.json(GetSettingsResponse.parse(requireValue(r).value));
});
careRouter.patch("/settings",async (req,res):Promise<void>=>{
  const input=UpdateSettingsBody.parse(req.body);
  try {new Intl.DateTimeFormat("en",{timeZone:input.timezone});} catch {throw new AppError(400,"Invalid IANA timezone");}
  await db.update(settings).set({value:input}).where(eq(settings.id,"practice"));
  await writeAudit(db,actor(res),"update_practice_settings","practice");
  res.json(input);
});
careRouter.get("/readyz",async (_req,res):Promise<void>=>{
  await db.select({id:patients.id}).from(patients).limit(1);
  res.json({status:"ready",dataClass:"synthetic",singlePractice:true});
});

function validatePatient(input:{dob:string;timezone?:string;firstName:string;lastName:string}) {
  if(!input.firstName.trim()||!input.lastName.trim()) throw new AppError(400,"First and last names are required");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.dob)||!Number.isFinite(Date.parse(input.dob))||input.dob>new Date().toISOString().slice(0,10)) throw new AppError(400,"Date of birth must be a valid past calendar date");
  if(input.timezone) try {new Intl.DateTimeFormat("en",{timeZone:input.timezone});} catch {throw new AppError(400,"Invalid IANA timezone");}
}
