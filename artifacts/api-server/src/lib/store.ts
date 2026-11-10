import { randomUUID } from "node:crypto";
import { and, eq, desc } from "drizzle-orm";
import { db, records, patients, audit, type RecordRow, type PatientRow } from "@workspace/db";
import { requireValue, AppError } from "./errors";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Store = Pick<typeof db, "select" | "insert" | "update" | "delete" | "execute">;
export type Actor = { id: string; name: string; role: string; credential: string; email: string; patientId?: string | null };
export type RecordInput = {
  title: string; patientId?: string | null; program?: string | null; status?: string;
  severity?: string; description?: string; assignee?: string; date?: string;
  value?: number; unit?: string; metadata?: Record<string, unknown>;
};
export const now = () => new Date().toISOString();
export const id = () => randomUUID();

export async function writeAudit(s: Store, actor: Actor, action: string, entityId: string, patientId?: string | null, detail: Record<string, unknown> = {}) {
  await s.insert(audit).values({ id: id(), actorId: actor.id, actorName: actor.name, action, entityId, patientId, detail });
}
export async function allRecords(s: Store = db, kind?: string) {
  return s.select().from(records).where(kind ? eq(records.kind, kind) : undefined).orderBy(desc(records.date));
}
export async function getRecord(s: Store, recordId?: string, kind?: string) {
  if (!recordId) throw new AppError(400, "A record identifier is required");
  const [r] = await s.select().from(records).where(and(eq(records.id, recordId), kind ? eq(records.kind, kind) : undefined));
  return requireValue(r);
}
export async function getPatientRow(s: Store, patientId?: string) {
  if (!patientId) throw new AppError(400, "A patient is required");
  const [p] = await s.select().from(patients).where(eq(patients.id, patientId));
  return requireValue(p, "Patient not found");
}
export async function addRecord(s: Store, kind: string, input: RecordInput, actor: Actor) {
  if (input.patientId) await getPatientRow(s, input.patientId);
  const [r] = await s.insert(records).values({
    ...input, id: id(), kind, date: input.date || now(), metadata: input.metadata || {}, createdBy: actor.id,
  }).returning();
  await writeAudit(s, actor, `create_${kind}`, r!.id, input.patientId);
  if(kind==="messages"||(kind==="exceptions"&&input.severity==="critical")) {
    await s.insert(records).values({
      id:id(),kind:"notifications",patientId:input.patientId,program:input.program,
      title:kind==="messages"?"A secure message is waiting in Mahalo Care":"A patient needs attention in Mahalo Care",
      status:"captured",description:"Console adapter captured this notification. No SMS, email or push was sent.",
      date:now(),createdBy:actor.id,metadata:{sourceRecordId:r!.id,channel:"in_app",driver:"console",containsClinicalContent:false},
    });
  }
  return r!;
}
export async function patchRecord(s: Store, r: RecordRow, patch: Partial<RecordInput>, actor: Actor, action = "update") {
  const [updated] = await s.update(records).set({ ...patch, updatedAt: new Date() }).where(eq(records.id, r.id)).returning();
  await writeAudit(s, actor, `${action}_${r.kind}`, r.id, r.patientId);
  return updated!;
}
export function serializeRecord(r: RecordRow, ps: PatientRow[] = []) {
  const p = ps.find(p => p.id === r.patientId);
  return { ...r, patientName: p ? `${p.firstName} ${p.lastName}` : "", createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
}
export function patientView(p: PatientRow, rs: RecordRow[]) {
  const mine = rs.filter(r => r.patientId === p.id);
  const es = mine.filter(r => r.kind === "enrollments" && r.status === "active");
  const open = mine.filter(r => r.kind === "exceptions" && ["open", "acknowledged"].includes(r.status));
  const contact = mine.filter(r => r.kind === "interactions" && r.status === "completed").sort((a,b) => b.date.localeCompare(a.date))[0];
  const cutoff = now().slice(0,7);
  const committed = mine.filter(r => r.kind === "time" && r.status === "committed" && r.date.startsWith(cutoff));
  const observations = mine.filter(r => r.kind === "observations" && r.metadata.valid !== false && r.date.startsWith(cutoff));
  const days = new Set(observations.map(r => new Intl.DateTimeFormat("en-CA", {timeZone:p.timezone}).format(new Date(r.date)))).size;
  const tasks = mine.filter(r => r.kind === "tasks");
  return {
    ...p, createdAt: p.createdAt.toISOString(), programs: [...new Set(es.map(e => e.program || ""))],
    risk: open.some(e => e.severity === "critical") ? "critical" : open.some(e => e.severity === "high") ? "high" : open.length ? "medium" : "low",
    lastContact: contact?.date || p.createdAt.toISOString(),
    minutes: committed.reduce((n,r) => n + r.value,0), deviceDays: days,
    adherence: tasks.length ? Math.round(tasks.filter(t => t.status === "completed").length / tasks.length * 100) : 0,
  };
}
