import {Router,type RequestHandler} from "express";
import rateLimit from "express-rate-limit";
import {z} from "zod";
import {and,eq,sql} from "drizzle-orm";
import {db,users,sessions,patients,type EmergencyContext} from "@workspace/db";
import {LoginResponse} from "@workspace/api-zod";
import {safeUser,sessionReference} from "../lib/account-security";
import {applyEmergencyContext} from "../lib/emergency-context";
import {scopedPatients,hasPermission} from "../lib/access";
import {allRecords,writeAudit,type Actor} from "../lib/store";
import {clinicalPatient} from "../lib/datasets";
import {AppError} from "../lib/errors";

export const emergencyAccessRouter=Router();
const inputSchema=z.object({mrn:z.string().trim().min(2).max(100),reason:z.string().trim().min(20).max(1000),attested:z.literal(true)});
const startLimit=rateLimit({windowMs:60*60*1000,limit:30,keyGenerator:(_req,res)=>String(res.locals.actor.id),standardHeaders:"draft-8",legacyHeaders:false});
emergencyAccessRouter.post("/auth/emergency-access",startLimit,async(req,res):Promise<void>=>{
  const input=inputSchema.parse(req.body),actor=res.locals.actor as Actor;
  const result=await db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    const [u]=await s.select().from(users).where(eq(users.id,actor.id)).for("share");
    const [session]=await s.select().from(sessions).where(and(eq(sessions.tokenHash,res.locals.sessionHash),eq(sessions.userId,actor.id))).for("update");
    if(!u||u.status!=="active"||!session||session.expiresAt<=new Date())throw new AppError(401,"Sign in again.");
    const normal=safeUser(u,session.activeLocation);
    if(!normal.canUseEmergencyAccess)throw new AppError(403,"Emergency access is limited to authorized, location-scoped clinical staff.");
    if(applyEmergencyContext(normal,session.emergencyContext).emergencyContext)throw new AppError(409,"End the current emergency access before selecting another patient.");
    const matches=await s.select().from(patients).where(and(clinicalPatient,sql`lower(${patients.mrn})=lower(${input.mrn})`)).limit(2);
    if(!matches.length)throw new AppError(404,"No patient matches that medical record number.");
    if(matches.length!==1)throw new AppError(409,"This identifier needs administrator review before access can be granted.");
    const patient=matches[0]!;
    if(hasPermission(normal,"clinical.read")&&scopedPatients(normal,[patient]).length)throw new AppError(409,"This patient is already available in your current location context.");
    if((await allRecords(s,"time")).some(r=>r.metadata.userId===actor.id&&r.metadata.source==="timer"&&["running","draft"].includes(r.status)))throw new AppError(409,"Finish or discard your tracked care time before starting emergency access.");
    const clock=Date.now(),ctx:EmergencyContext={patientId:patient.id,patientName:`${patient.firstName} ${patient.lastName}`,mrn:patient.mrn,location:patient.location,reason:input.reason,startedAt:new Date(clock).toISOString(),expiresAt:new Date(Math.min(clock+4*60*60*1000,session.expiresAt.getTime())).toISOString()};
    await s.update(sessions).set({emergencyContext:ctx,lastSeenAt:new Date(clock)}).where(eq(sessions.tokenHash,session.tokenHash));
    await writeAudit(s,normal,"break_glass",patient.id,patient.id,{reason:ctx.reason,expiresAt:ctx.expiresAt,scope:"one_patient_read_only",location:ctx.location,patientName:ctx.patientName,mrn:ctx.mrn,role:normal.role,credential:normal.credential,sessionReference:sessionReference(session.tokenHash)});
    return applyEmergencyContext(normal,ctx,clock);
  });
  res.json(LoginResponse.parse(result));
});
emergencyAccessRouter.post("/auth/emergency-access/end",async(_req,res):Promise<void>=>{
  const actor=res.locals.actor as Actor;
  const result=await db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    const [u]=await s.select().from(users).where(eq(users.id,actor.id)).for("share");
    const [session]=await s.select().from(sessions).where(and(eq(sessions.tokenHash,res.locals.sessionHash),eq(sessions.userId,actor.id))).for("update");
    if(!u||u.status!=="active"||!session||session.expiresAt<=new Date())throw new AppError(401,"Sign in again.");
    const normal=safeUser(u,session.activeLocation);
    if(session.emergencyContext){
      await s.update(sessions).set({emergencyContext:null,lastSeenAt:new Date()}).where(eq(sessions.tokenHash,session.tokenHash));
      await writeAudit(s,normal,"end_break_glass",session.emergencyContext.patientId,session.emergencyContext.patientId,{reason:"Ended by the authenticated user",sessionReference:sessionReference(session.tokenHash)});
    }
    return {...normal,emergencyContext:null};
  });
  res.json(LoginResponse.parse(result));
});
/** Persist the read attempt before returning clinical data; background auth polling is excluded. */
export const emergencyReadAudit:RequestHandler=async(req,res,next)=>{
  const actor=res.locals.actor as Actor,ctx=actor?.emergencyContext;
  if(ctx&&req.method==="GET"&&!req.path.startsWith("/auth/"))await writeAudit(db,actor,"break_glass_read",ctx.patientId,ctx.patientId,{path:req.path,expiresAt:ctx.expiresAt,sessionReference:sessionReference(res.locals.sessionHash),event:"authorized_read_attempt"});
  next();
};
