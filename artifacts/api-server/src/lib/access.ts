import { db, type PatientRow, type RecordRow } from "@workspace/db";
import { AppError } from "./errors";
import { getPatientRow, type Actor, type Store } from "./store";
import {educationAvailable,instrumentAvailable} from "./content-review";

export const rolePermissions: Record<string, readonly string[]> = {
  admin: ["admin", "audit.read", "patients.read", "patients.write", "clinical.read", "clinical.write", "plans.sign", "notes.sign", "time.write", "messages.write", "devices.write", "billing.read", "billing.write"],
  clinical_admin: ["audit.read", "patients.read", "patients.write", "clinical.read", "clinical.write", "plans.sign", "notes.sign", "time.write", "messages.write", "devices.write", "billing.read"],
  billing_provider: ["patients.read", "patients.write", "clinical.read", "clinical.write", "plans.sign", "notes.sign", "time.write", "messages.write", "devices.write", "billing.read", "billing.write"],
  care_manager: ["patients.read", "patients.write", "clinical.read", "clinical.write", "notes.sign", "time.write", "messages.write", "devices.write"],
  behavioral_care_manager: ["patients.read", "patients.write", "clinical.read", "clinical.write", "notes.sign", "time.write", "messages.write", "devices.write"],
  psychiatric_consultant: ["patients.read", "clinical.read", "clinical.write", "notes.sign", "time.write", "messages.write"],
  therapist: ["patients.read", "patients.write", "clinical.read", "clinical.write", "plans.sign", "notes.sign", "time.write", "messages.write", "devices.write"],
  front_desk: ["patients.read", "patients.write", "messages.write", "devices.write"],
  billing: ["patients.read", "clinical.read", "billing.read", "billing.write"],
  read_only: ["patients.read", "clinical.read", "billing.read"],
  patient: [],
};

export const permissionsFor = (role: string) => [...(rolePermissions[role] ?? [])];
export const hasPermission = (actor: Actor, permission: string) => permissionsFor(actor.role).includes(permission);
export function authorize(actor: Actor, permission: string) {
  if (!hasPermission(actor, permission)) throw new AppError(403, "Your role does not permit this action");
}
export function inLocation(actor: Actor, location: string) {
  return actor.role === "admin" || !actor.locationScopes?.length || actor.locationScopes.includes(location);
}
export function scopedPatients(actor: Actor, ps: PatientRow[]) {
  return ps.filter(p => actor.role === "patient" ? p.id === actor.patientId : inLocation(actor, p.location));
}
export function scopedRecords(actor: Actor, rs: RecordRow[], ps: PatientRow[]) {
  const visible = new Set(scopedPatients(actor, ps).map(p => p.id));
  return rs.filter(r => {
    if(actor.role==="patient"&&(r.kind==="education"&&!educationAvailable(r)||r.kind==="instruments"&&!instrumentAvailable(r)))return false;
    return r.patientId ? visible.has(r.patientId) : r.kind !== "locations" || inLocation(actor, r.title);
  });
}
export async function assertPatientAccess(actor: Actor, patientId: string, s: Store = db) {
  const p = await getPatientRow(s, patientId);
  if (actor.role === "patient" ? p.id !== actor.patientId : !inLocation(actor, p.location)) {
    throw new AppError(403, "This patient is outside your location scope");
  }
  return p;
}
