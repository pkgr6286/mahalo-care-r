import type { Request, Response, NextFunction } from "express";
import { getRecord, type Actor } from "../lib/store";
import { db } from "@workspace/db";

/** Patient sessions use the same password/session mechanism but a strictly smaller API surface. */
export async function patientScope(req:Request,res:Response,next:NextFunction):Promise<void> {
  const actor=res.locals.actor as Actor;
  if(actor.role!=="patient") {next();return;}
  const deny=()=>res.status(403).json({error:"This resource is available only to the care team"});
  const patientId=actor.patientId;
  if(!patientId) {deny();return;}
  if(["/auth/me","/auth/logout"].includes(req.path)) {next();return;}
  if(req.method==="GET"&&req.path==="/patients") {next();return;}
  if(req.method==="GET"&&req.path===`/patients/${patientId}`) {next();return;}
  if(req.method==="GET"&&/^\/records\/[^/]+$/.test(req.path)) {
    const kind=req.path.split("/")[2]!;
    if(!["tasks","observations","responses","messages","devices","careplans","consents","education","instruments","enrollments"].includes(kind)) {deny();return;}
    next();return;
  }
  if(req.method==="GET"&&req.path.startsWith("/documents/")) {
    const record=await getRecord(db,req.path.split("/")[2]);
    if(record.patientId!==patientId||!["careplans","consents"].includes(record.kind)||record.status==="draft") {deny();return;}
    next();return;
  }
  if(req.method==="POST"&&req.path==="/records/messages") {
    if(req.body.patientId!==patientId) {deny();return;}
    req.body.metadata={direction:"inbound",sender:actor.name,channel:"secure"};
    req.body.status="sent";
    next();return;
  }
  if(req.method==="POST"&&req.path==="/actions") {
    if(!["submitCheckin","recordAdherence","completeTask","revokeConsent","createVideo"].includes(req.body.action)) {deny();return;}
    if(req.body.patientId&&req.body.patientId!==patientId) {deny();return;}
    if(req.body.id) {
      const record=await getRecord(db,req.body.id);
      if(record.patientId!==patientId) {deny();return;}
    }
    req.body.patientId=patientId;
    next();return;
  }
  deny();
}
