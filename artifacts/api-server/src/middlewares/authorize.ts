import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { authorize, assertPatientAccess, inLocation,hasPermission } from "../lib/access";
import { getRecord, type Actor } from "../lib/store";
import { AppError } from "../lib/errors";

const configKinds = new Set(["programs", "rules", "templates", "locations", "staff", "instruments", "education", "integrations"]);
const billingActions = new Set(["calculateBilling", "closePeriod", "reopenPeriod", "approveLine", "rejectLine", "bulkApproveLines"]);
const adminActions = new Set(["importConfiguration", "importPatients", "testIntegration"]);

/** All staff requests pass through this single policy boundary, including forged direct API requests. */
export async function staffAuthorization(req: Request, res: Response, next: NextFunction): Promise<void> {
  if(req.body==null) req.body={};
  const actor = res.locals.actor as Actor;
  if (actor.role === "patient") { next(); return; } // separately deny-by-default in patientScope
  const path = req.path;
  if (path.startsWith("/auth/")) { next(); return; }
  const write = !["GET", "HEAD"].includes(req.method);
  let permission: string;
  if (path.startsWith("/accounts") || path.startsWith("/operations")) permission = "admin";
  else if(path==="/workspace/preferences") permission="patients.read";
  else if(path==="/worklists") permission=req.query.kind==="device_issues"&&hasPermission(actor,"devices.write")?"devices.write":"clinical.read";
  else if(path==="/worklists/assign") permission="patients.read"; // per-record write permission and scope checked atomically
  else if(path==="/worklists/consultant-review") permission="clinical.write";
  else if (path === "/settings") permission = write ? "admin" : "patients.read";
  else if(path==="/policies"||path.startsWith("/policies/")) permission=!write||path==="/policies/validate"?(hasPermission(actor,"clinical.read")?"clinical.read":"billing.read"):path.endsWith("/review")?"plans.sign":"admin";
  else if (path === "/readyz") permission = "patients.read";
  else if (path === "/patients") permission = write ? "patients.write" : "patients.read";
  else if(/^\/patients\/[^/]+\/attachments(?:\/|$)/.test(path)) permission=write?"clinical.write":"clinical.read";
  else if (path.startsWith("/patients/")) permission = write ? "patients.write" : "clinical.read";
  else if (path === "/reports") permission = "clinical.read";
  else if (path === "/dashboard") permission = "clinical.read";
  else if (path.startsWith("/exports/")) {
    const kind = path.split("/")[2];
    permission = kind === "configuration" ? "admin" : kind === "audit" ? "audit.read" : kind === "billing" ? "billing.read" : "patients.read";
  } else if (path.startsWith("/documents/")) permission = "clinical.read";
  else if(path==="/ai/review-metrics"&&!write) permission="clinical.read";
  else if(/^\/ai\/drafts\/[^/]+\/check$/.test(path)&&req.method==="POST") permission="clinical.write";
  else if (path.startsWith("/records/")) {
    const kind = path.split("/")[2] ?? "";
    permission = kind === "audit" ? "audit.read" : kind === "notifications" ? "admin" : kind === "billing" ? (write ? "billing.write" : "billing.read")
      : configKinds.has(kind) ? (write ? "admin" : "patients.read")
      : kind === "messages" ? (write ? "messages.write" : "clinical.read")
      : kind === "devices" ? (write ? "devices.write" : "patients.read")
      : write ? "clinical.write" : "clinical.read";
  } else if (path === "/actions") {
    const action = String(req.body.action);
    permission = billingActions.has(action) ? "billing.write" : adminActions.has(action) ? "admin"
      : action === "signPlan" ? "plans.sign" : action === "signNote" ? "notes.sign"
      : ["startTimer", "stopTimer", "discardTimer", "commitTime", "voidTime", "suggestTime"].includes(action) ? "time.write"
      : action === "simulateReading" ? "devices.write" : "clinical.write";
    // Period-level actions affect the whole practice, not merely the caller's visible charts.
    if (["calculateBilling", "closePeriod", "reopenPeriod"].includes(action) && actor.role !== "admin" && actor.locationScopes?.length) {
      throw new AppError(403, "Practice-wide billing operations require access to all locations");
    }
  } else {
    throw new AppError(403, "This API is not available to your role");
  }
  authorize(actor, permission);

  // Resolve ownership from the stored record, never trust an incoming patient identifier.
  let pid: string | undefined;
  if (path.startsWith("/patients/")) pid = path.split("/")[2];
  const recordId = path.startsWith("/documents/") ? path.split("/")[2]
    : path.startsWith("/ai/drafts/") ? path.split("/")[3]
    : path.startsWith("/records/") && path.split("/")[3] ? path.split("/")[3]
    : path === "/actions" && typeof req.body.id === "string" ? req.body.id : undefined;
  if (recordId) {
    const record = await getRecord(db, recordId);
    pid = record.patientId ?? undefined;
    if (pid && req.body?.patientId && req.body.patientId !== pid) throw new AppError(400, "Patient identifier does not match the selected record");
  }
  if (pid) await assertPatientAccess(actor, pid);
  if(path==="/actions"&&req.body.action==="bulkApproveLines"&&Array.isArray(req.body.payload?.ids)) {
    for(const lineId of req.body.payload.ids.slice(0,100)) {
      const line=await getRecord(db,String(lineId),"billing");
      if(line.patientId) await assertPatientAccess(actor,line.patientId);
    }
  }
  if (typeof req.body?.patientId === "string") await assertPatientAccess(actor, req.body.patientId);
  if (write && typeof req.body?.location === "string" && !inLocation(actor, req.body.location)) {
    throw new AppError(403, "The selected location is outside your scope");
  }
  next();
}
