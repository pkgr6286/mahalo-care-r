import {assertManagedDirectoryIdentity,assertManualDirectoryCreation} from "../lib/staff-directory";
import { Router } from "express";
import {isReleasedPatientDocument} from "../lib/document-access";
import { eq, desc, and } from "drizzle-orm";
import { db, patients, records, audit, settings } from "@workspace/db";
import {
  CreatePatientBody, UpdatePatientBody, ListPatientsQueryParams, CreateRecordBody, UpdateRecordBody,
  PerformActionBody, UpdateSettingsBody, ListRecordsParams, CreateRecordParams,
  GetPatientParams, GetRecordParams, UpdateRecordParams, GetSettingsResponse,
} from "@workspace/api-zod";
import { allRecords, addRecord, patchRecord, getRecord, getPatientRow, id, writeAudit, patientView, serializeRecord, type Actor } from "../lib/store";
import { performAction } from "../lib/actions";
import { overview } from "../lib/overview";
import { AppError, requireValue } from "../lib/errors";
import { ingestReading } from "../lib/observations";
import { scopedPatients, scopedRecords, hasPermission, assertPatientAccess } from "../lib/access";
import {educationHash} from "../lib/education";
import {reviewedContentMetadata,educationAvailable} from "../lib/content-review";
import {communicationPreferencesSchema} from "../lib/communication-preferences";
import {isEhrCache} from "../lib/ehr-sync";
import { validateReference } from "../lib/reference-validation";
import { enqueueJob } from "../lib/job-store";
import {prepareTemplatedNote} from "../lib/note-templates";
import {taskAssignment} from "../lib/task-assignment";

export const careRouter=Router();
const actor=(res:{locals:Record<string,unknown>})=>res.locals.actor as Actor;
function protectClinicalPatientFields(who:Actor,input:Record<string,unknown>,creating=false) {
  if(hasPermission(who,"clinical.write")) return;
  const clinical=["conditions","medications"].some(key=>key in input&&(!creating||Array.isArray(input[key])&&(input[key] as unknown[]).length>0));
  if(clinical||("status" in input&&(!creating||input.status!=="active"))) throw new AppError(403,"Clinical permissions are required to change clinical details or patient status");
}
const protectedKinds=["enrollments","consents","time","billing","responses","drafts","notifications","audit"];

careRouter.get("/dashboard",async (_req,res):Promise<void>=>{res.json((await overview(actor(res))).dashboard);});
careRouter.get("/reports",async (_req,res):Promise<void>=>{res.json((await overview(actor(res))).reports);});
careRouter.get("/patients",async (req,res):Promise<void>=>{
  const query=ListPatientsQueryParams.parse(req.query),rs=await allRecords(), ps=await db.select().from(patients).orderBy(patients.lastName);
  const who=actor(res);
  const filtered=scopedPatients(who,ps).map(p=>patientView(hasPermission(who,"clinical.read")||who.role==="patient"?p:{...p,conditions:[],medications:[]},hasPermission(who,"clinical.read")||who.role==="patient"?rs:[])).filter(p=>
    (!query.search||`${p.firstName} ${p.lastName} ${p.mrn}`.toLowerCase().includes(query.search.toLowerCase()))&&
    (!query.program||p.programs.includes(query.program))&&(!query.status||p.status===query.status));
  await writeAudit(db,who,"list_patients","practice",null,{count:filtered.length});
  res.json(filtered);
});
careRouter.post("/patients",async (req,res):Promise<void>=>{
  const input=CreatePatientBody.parse(req.body);validatePatient(input);
  protectClinicalPatientFields(actor(res),input,true);
  const patient=await db.transaction(async s=>{
    const [p]=await s.insert(patients).values({...input,id:id(),mrn:`MC-${Date.now().toString(36).toUpperCase()}`}).returning();
    await writeAudit(s,actor(res),"create_patient",p!.id,p!.id);return p!;
  });
  res.status(201).json(patientView(patient,[]));
});
careRouter.get("/patients/:id",async (req,res):Promise<void>=>{
  const {id}=GetPatientParams.parse(req.params),p=await assertPatientAccess(actor(res),id);
  const rs=await allRecords();
  await writeAudit(db,actor(res),"read_chart",id,id);
  const who=actor(res);
  const visible=rs.filter(r=>r.patientId===id&&(who.role!=="patient"||(["tasks","observations","responses","messages","devices","careplans","consents","enrollments"].includes(r.kind)&&!(r.kind==="careplans"&&r.status==="draft")&&!(r.kind==="tasks"&&r.metadata.audience==="staff"))));
  res.json({patient:patientView(p,rs),records:visible.map(r=>serializeRecord(r,[p]))});
});
careRouter.patch("/patients/:id",async (req,res):Promise<void>=>{
  const {id}=GetPatientParams.parse(req.params),input=UpdatePatientBody.parse(req.body);validatePatient(input);
  protectClinicalPatientFields(actor(res),input);
  const oldPatient=await getPatientRow(db,id);
  if(input.communicationPreferences)input.communicationPreferences={...oldPatient.communicationPreferences,...input.communicationPreferences};
  const [p]=await db.update(patients).set({...input,updatedAt:new Date()}).where(eq(patients.id,id)).returning();
  await writeAudit(db,actor(res),"update_patient",id,id);
  res.json(patientView(p!,await allRecords()));
});
careRouter.get("/records/:kind",async (req,res):Promise<void>=>{
  const {kind}=ListRecordsParams.parse(req.params);
  if(kind==="audit") {
    const events=await db.select().from(audit).orderBy(desc(audit.at)).limit(500);
    const ps=scopedPatients(actor(res),await db.select().from(patients)),visibleIds=new Set(ps.map(p=>p.id));
    res.json(events.filter(e=>!e.patientId||visibleIds.has(e.patientId)).map(e=>({id:e.id,kind:"audit",title:e.action.replaceAll("_"," "),description:e.actorName,patientId:e.patientId,patientName:ps.find(p=>p.id===e.patientId)?.lastName??"",status:"recorded",date:e.at.toISOString(),createdAt:e.at.toISOString(),updatedAt:e.at.toISOString(),metadata:{...e.detail,entityId:e.entityId,actor:e.actorName}})));return;
  }
  const [rs,ps]=await Promise.all([allRecords(db,kind),db.select().from(patients)]);
  const who=actor(res);
  const visible=scopedRecords(who,rs,ps).filter(r=>who.role!=="patient"||(r.patientId===who.patientId&&!(["careplans","consents"].includes(kind)&&!isReleasedPatientDocument(r))&&!(kind==="tasks"&&r.metadata.audience==="staff"))||(["education","instruments"].includes(kind)&&!r.patientId));
  await writeAudit(db,who,`list_${kind}`,"practice",null,{count:visible.length});
  res.json(visible.filter(r=>who.role!=="patient"||(kind==="education"?educationAvailable(r):kind!=="instruments"||r.status==="active")).map(r=>serializeRecord(kind==="education"?{...r,metadata:{...r.metadata,contentHash:educationHash(r)}}:r,ps)));
});
careRouter.get("/records/:kind/:id",async(req,res):Promise<void>=>{
  if(actor(res).role==="patient") throw new AppError(403,"Use your patient workspace to access released clinical information");
  const {kind,id}=GetRecordParams.parse(req.params),r=await getRecord(db,id,kind);
  const ps=await db.select().from(patients);
  await writeAudit(db,actor(res),`read_${kind}`,r.id,r.patientId);
  res.json(serializeRecord(r,ps));
});
careRouter.post("/records/:kind",async (req,res):Promise<void>=>{
  const {kind}=CreateRecordParams.parse(req.params),input=CreateRecordBody.parse(req.body);
  input.metadata=reviewedContentMetadata(kind,input,actor(res));
  validateReference(kind,input);
  if(protectedKinds.includes(kind)) throw new AppError(400,"Use the dedicated workflow action to create this record");
  if(["notes","careplans"].includes(kind)&&input.status&&input.status!=="draft") throw new AppError(400,"Clinical documents must be created as drafts");
  if(["notes","careplans","exceptions","responses","interactions"].includes(kind)&&!input.patientId) throw new AppError(400,"Select a patient for this clinical record");
  if(kind==="interactions"&&input.metadata?.isLiveTwoWay===true&&input.status!=="completed") throw new AppError(400,"Only completed interactions can count as live contact");
  const r=await db.transaction(async s=>{
    if(kind==="staff")await assertManualDirectoryCreation(s,input.metadata);
    const prepared=kind==="notes"?await prepareTemplatedNote(s,input):kind==="tasks"?await taskAssignment(s,input.patientId,input):input;
    const r=kind==="observations"?await ingestReading(s,input,actor(res)):await addRecord(s,kind,{...prepared,status:["notes","careplans"].includes(kind)?"draft":input.status},actor(res));
    if(input.patientId) await enqueueJob(s,"patient_rules",`record:${r.id}`,{patientId:input.patientId});
    return r;
  });
  res.status(201).json(serializeRecord(r,await db.select().from(patients)));
});
careRouter.patch("/records/:kind/:id",async (req,res):Promise<void>=>{
  const {kind,id}=UpdateRecordParams.parse(req.params),{expectedUpdatedAt,...input}=UpdateRecordBody.parse(req.body);
  if(protectedKinds.includes(kind)||kind==="observations") throw new AppError(400,"Use a workflow action to change this record; source readings cannot be overwritten");
  if(["notes","careplans"].includes(kind)&&input.status&&input.status!=="draft") throw new AppError(400,"Use the signing workflow to change document status");
  const r=await db.transaction(async s=>{
    await s.select({id:records.id}).from(records).where(eq(records.id,id)).for("update");
    const old=await getRecord(s,id,kind);
    if(kind==="staff")assertManagedDirectoryIdentity(old,input);
    if(["notes","careplans"].includes(kind)&&old.status==="cancelled") throw new AppError(409,"Restore this discarded draft with a reason before editing it");
    if(expectedUpdatedAt&&expectedUpdatedAt.getTime()!==old.updatedAt.getTime()) throw new AppError(409,"This record changed while you were editing. Refresh it and review the latest version before saving.");
    if(isEhrCache(old))throw new AppError(400,"Cached EHR history is read-only; refresh or confirm identity instead");
    input.metadata=reviewedContentMetadata(kind,input,actor(res),old);
    validateReference(kind,{status:input.status??old.status,metadata:{...old.metadata,...input.metadata}});
    if(old.kind==="interactions"&&old.metadata.kind==="consultant_review") throw new AppError(400,"Consultant review attestations are immutable; record a new review instead");
    if(input.patientId!==undefined&&input.patientId!==old.patientId) throw new AppError(400,"A clinical record cannot be moved to a different patient");
    if(["notes","careplans"].includes(kind)&&old.metadata.priorVersionId&&input.program!==undefined&&input.program!==old.program) throw new AppError(400,"A document revision must remain in its original program");
    let metadata={...old.metadata,...input.metadata};
    if(kind==="notes") {
      const prepared=await prepareTemplatedNote(s,{...input,title:input.title??old.title,patientId:old.patientId,program:["signed","amended"].includes(old.status)?old.program:input.program??old.program,metadata},old);
      input.description=prepared.description;metadata=prepared.metadata??metadata;
    }
    if(["notes","careplans"].includes(kind)&&["active","signed","superseded","amended"].includes(old.status)) {
      return addRecord(s,kind,{title:input.title??old.title,description:input.description??old.description,severity:input.severity??old.severity,assignee:input.assignee??old.assignee,date:input.date,unit:input.unit??old.unit,value:input.value??old.value,patientId:old.patientId,program:old.program,status:"draft",metadata:{...metadata,priorVersionId:old.id,version:Number(old.metadata.version||1)+1,signedBy:null,signedById:null,signerRole:null,signerCredential:null,signedAt:null}},actor(res));
    }
    if(old.kind==="exceptions"&&input.status&&input.status!==old.status) throw new AppError(400,"Use acknowledge, resolve or dismiss for exception transitions");
    const prepared=kind==="tasks"?await taskAssignment(s,old.patientId,{...input,metadata}):{...input,metadata};
    return patchRecord(s,old,prepared,actor(res));
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

function validatePatient(input:{dob?:string;timezone?:string;firstName?:string;lastName?:string;location?:string;status?:string;communicationPreferences?:unknown}) {
  if(input.communicationPreferences!==undefined)communicationPreferencesSchema.parse(input.communicationPreferences);
  if([input.firstName,input.lastName,input.location].some(v=>v!==undefined&&!v.trim())) throw new AppError(400,"Names and location must not be blank");
  if(input.dob!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(input.dob)||!Number.isFinite(Date.parse(input.dob))||new Date(input.dob).toISOString().slice(0,10)!==input.dob||input.dob>new Date().toISOString().slice(0,10))) throw new AppError(400,"Date of birth must be a valid past calendar date");
  if(input.status!==undefined&&!["active","inactive"].includes(input.status)) throw new AppError(400,"Unsupported patient status");
  if(input.timezone!==undefined) try {if(!input.timezone.trim()) throw new Error();input.timezone=new Intl.DateTimeFormat("en",{timeZone:input.timezone}).resolvedOptions().timeZone;} catch {throw new AppError(400,"Invalid IANA timezone");}
}
