import {Router} from "express";
import {and,eq,sql} from "drizzle-orm";
import {db,users,type PatientRow} from "@workspace/db";
import {AssignWorklistRecordsBody,RecordConsultantReviewBody,UpdateWorkspacePreferencesBody,GetWorklistResponse} from "@workspace/api-zod";
import {getRecord,patchRecord,serializeRecord,type Actor} from "../lib/store";
import {authorize,assertPatientAccess,inLocation,hasPermission} from "../lib/access";
import {staffRoleAt} from "../lib/staff-identity";
import {AppError} from "../lib/errors";
import {queryWorklist} from "../lib/worklist-query";
import {parseWorklistQuery,WorklistKindSchema,isStaffCareTask} from "../lib/worklist-filters";
import {workspacePreferences,saveWorkspacePreferences} from "../lib/workspace-preferences";
import {performAction} from "../lib/actions";

export const worklistsRouter=Router();
worklistsRouter.get("/workspace/preferences",async(_req,res)=>res.json(await workspacePreferences(res.locals.actor)));
worklistsRouter.patch("/workspace/preferences",async(req,res)=>res.json(await saveWorkspacePreferences(res.locals.actor,UpdateWorkspacePreferencesBody.parse(req.body))));
worklistsRouter.get("/worklists",async(req,res)=>{
  const actor=res.locals.actor as Actor,kind=WorklistKindSchema.parse(req.query.kind),preferences=await workspacePreferences(actor);
  const query=parseWorklistQuery(req.query,preferences.worklists[kind]??{});
  res.json(GetWorklistResponse.parse(await queryWorklist(actor,query.kind,query.filters,query.page)));
});
worklistsRouter.post("/worklists/assign",async(req,res)=>{
  const actor=res.locals.actor as Actor,input=AssignWorklistRecordsBody.parse(req.body);
  if(new Set(input.ids).size!==input.ids.length) throw new AppError(400,"Select each record only once");
  const result=await db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    const [target]=input.assigneeId?await s.select().from(users).where(and(eq(users.id,input.assigneeId),eq(users.status,"active"))):[];
    if(input.assigneeId&&(!target||target.role==="patient")) throw new AppError(409,"The selected staff member is not active");
    const selected=await Promise.all(input.ids.map(id=>getRecord(s,id)));
    const ps:PatientRow[]=[];
    for(const r of selected) {
      authorize(actor,r.kind==="devices"?"devices.write":"clinical.write");
      if(!["exceptions","tasks","notes","careplans","enrollments","devices"].includes(r.kind)) throw new AppError(400,"This record cannot be assigned in a clinical worklist");
      if(!r.patientId) throw new AppError(400,"Assign operational work from its administration workflow");
      const p=await assertPatientAccess(actor,r.patientId,s);ps.push(p);
      const eligible=r.kind==="devices"||r.kind==="exceptions"&&["open","acknowledged"].includes(r.status)||r.kind==="tasks"&&["pending","open"].includes(r.status)&&isStaffCareTask(r.metadata)||["notes","careplans"].includes(r.kind)&&r.status==="draft"||r.kind==="enrollments"&&["active","paused"].includes(r.status);
      if(!eligible) throw new AppError(409,"Only open staff work and draft documents can be reassigned; signed records and patient activities cannot");
      if(r.kind==="devices"&&["returned","retired","inactive"].includes(r.status)) throw new AppError(409,"Returned or retired equipment cannot be reassigned");
      const targetRole=target&&staffRoleAt(target,p.location);
      if(target&&(!targetRole||!hasPermission({role:targetRole} as Actor,r.kind==="devices"?"devices.write":"clinical.write"))) throw new AppError(403,"The selected staff member cannot manage every selected patient's work");
    }
    const changed=[];
    for(const r of selected) changed.push(await patchRecord(s,r,{assignee:target?.name??"",metadata:{...r.metadata,ownerUserId:target?.id??null,ownerRole:target?staffRoleAt(target,ps.find(p=>p.id===r.patientId)!.location):r.metadata.ownerRole??null,assignmentSource:"manual",assignedById:actor.id,assignedAt:new Date().toISOString()}},actor,"assign_worklist_record"));
    return changed.map(r=>serializeRecord(r,ps));
  });
  res.json({success:true,count:result.length,records:result});
});
worklistsRouter.post("/worklists/consultant-review",async(req,res)=>{
  const actor=res.locals.actor as Actor,input=RecordConsultantReviewBody.parse(req.body),p=await assertPatientAccess(actor,input.patientId);
  const result=await performAction(actor,{action:"recordConsultantReview",patientId:p.id,program:"BHI",payload:{summary:input.summary,nextReviewDays:input.nextReviewDays,assessmentCompleted:input.assessmentCompleted}});
  if(!result.record) throw new AppError(500,"The consultant review was not created");
  res.status(200).json(serializeRecord(result.record,[p]));
});
