import { and, eq, sql } from "drizzle-orm";
import {
  db, patients, patientConditions, patientMedications, patientCoverage,
  patientContacts, patientIdentifiers,caregiverGrants,records,
} from "@workspace/db";
import { UpdateClinicalProfileBody } from "@workspace/api-zod";
import { authorize } from "./access";
import { AppError } from "./errors";
import { getPatientRow, id, writeAudit, type Actor, type Store } from "./store";

export async function clinicalProfile(s: Store, patientId: string) {
  const p = await getPatientRow(s, patientId);
  const [conditions, medications, coverage, contacts, identifiers] = await Promise.all([
    s.select().from(patientConditions).where(eq(patientConditions.patientId, patientId)),
    s.select().from(patientMedications).where(eq(patientMedications.patientId, patientId)),
    s.select().from(patientCoverage).where(eq(patientCoverage.patientId, patientId)),
    s.select().from(patientContacts).where(eq(patientContacts.patientId, patientId)),
    s.select().from(patientIdentifiers).where(eq(patientIdentifiers.patientId, patientId)),
  ]);
  return { patientId, updatedAt: p.updatedAt.toISOString(), expectedUpdatedAt: p.updatedAt.toISOString(), conditions, medications, coverage, contacts, identifiers };
}

function validateRawDates(raw: unknown) {
  if (!raw || typeof raw !== "object") return;
  const input = raw as Record<string, unknown>;
  const dayKeys = new Set(["onsetDate", "startedOn", "effectiveFrom", "effectiveTo"]);
  for (const section of ["conditions", "medications", "coverage", "contacts"]) {
    if (!Array.isArray(input[section])) continue;
    for (const row of input[section] as Record<string, unknown>[]) {
      if (!row || typeof row !== "object") continue;
      for (const [key, value] of Object.entries(row)) {
        if (value == null || !dayKeys.has(key)) continue;
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
          throw new AppError(400, `${key}: provide a valid calendar date`);
        }
      }
    }
  }
}
const day = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) ?? null;
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new AppError(400, `Duplicate ${label} in the profile`);
}
function assertIds(rows: {id?:string}[], existing: {id:string}[]) {
  const own = new Set(existing.map(r => r.id));
  unique(rows.flatMap(r => r.id ? [r.id] : []), "row identifiers");
  if (rows.some(r => r.id && !own.has(r.id))) throw new AppError(400, "A profile row does not belong to this patient; omit its ID to create a new row");
}

export async function updateClinicalProfile(actor: Actor, patientId: string, raw: unknown) {
  authorize(actor, "clinical.write");
  validateRawDates(raw);
  const input = UpdateClinicalProfileBody.parse(raw);
  if (!["conditions", "medications", "coverage", "contacts", "identifiers"].some(key => key in input)) throw new AppError(400, "Choose a profile section to update");
  return db.transaction(async s => {
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    const [p] = await s.select().from(patients).where(eq(patients.id, patientId)).for("update");
    if (!p) throw new AppError(404, "Patient not found");
    if (p.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new AppError(409, "The chart changed since you opened it. Reload the profile before saving; your edits have not been applied.");
    const before = await clinicalProfile(s, patientId), at = new Date();
    if (input.conditions) {
      assertIds(input.conditions, before.conditions);
      unique(input.conditions.map(c => `${c.codeSystem}:${c.code.trim().toUpperCase()}`), "condition codes");
      if (input.conditions.some(c => !c.code.trim() || !c.display.trim() || c.onsetDate && c.onsetDate > at)) throw new AppError(400, "Conditions need a code, description and non-future onset date");
      await s.delete(patientConditions).where(eq(patientConditions.patientId, patientId));
      if (input.conditions.length) await s.insert(patientConditions).values(input.conditions.map(c => ({...c, id: c.id ?? id(), patientId, code: c.code.trim().toUpperCase(), display: c.display.trim(), onsetDate: day(c.onsetDate), recordedBy: actor.id, updatedAt: at})));
    }
    if (input.medications) {
      assertIds(input.medications, before.medications);
      if (input.medications.some(m => !m.name.trim() || !m.dose.trim() || !m.frequency.trim() || m.startedOn && m.startedOn > at)) throw new AppError(400, "Medications need a name, dose, frequency and non-future start date");
      await s.delete(patientMedications).where(eq(patientMedications.patientId, patientId));
      if (input.medications.length) await s.insert(patientMedications).values(input.medications.map(m => ({...m, id: m.id ?? id(), patientId, name: m.name.trim(), startedOn: day(m.startedOn), reconciledAt: at, reconciledBy: actor.name, updatedAt: at})));
    }
    if (input.coverage) {
      assertIds(input.coverage, before.coverage);
      if (input.coverage.some(c => c.effectiveTo && c.effectiveTo < c.effectiveFrom || !c.memberId.trim())) throw new AppError(400, "Coverage needs a member ID and an end date on or after its start date");
      await s.delete(patientCoverage).where(eq(patientCoverage.patientId, patientId));
      if (input.coverage.length) await s.insert(patientCoverage).values(input.coverage.map(c => ({...c, id: c.id ?? id(), patientId, effectiveFrom: day(c.effectiveFrom)!, effectiveTo: day(c.effectiveTo), verifiedAt: c.verifiedAt ? at : null, updatedAt: at})));
    }
    if (input.contacts) {
      assertIds(input.contacts, before.contacts);
      if (input.contacts.some(c => c.sharingAllowed && (!c.consentRecordedAt || c.consentRecordedAt > at || !c.sharingScope?.length))) throw new AppError(400, "Information sharing needs documented consent and an explicit sharing scope");
      const time=(v:Date|string|null|undefined)=>v instanceof Date?v.getTime():v?Date.parse(v):0;
      for(const old of before.contacts) {
        const next=input.contacts.find(c=>c.id===old.id);
        const changed=!next||!next.sharingAllowed||next.email.toLowerCase()!==old.email.toLowerCase()||
          JSON.stringify([...(next.sharingScope??[])].sort())!==JSON.stringify([...old.sharingScope].sort())||
          time(next.consentRecordedAt)!==time(old.consentRecordedAt);
        if(changed) {
          const grants=await s.select().from(caregiverGrants).where(and(eq(caregiverGrants.patientId,patientId),eq(caregiverGrants.contactId,old.id),eq(caregiverGrants.status,"active")));
          for(const grant of grants) {
            const reason="Contact sharing permission or identity changed; a new documented grant is required.";
            await s.update(caregiverGrants).set({status:"revoked",revokedAt:at,reason}).where(eq(caregiverGrants.id,grant.id));
            await s.update(records).set({status:"revoked",updatedAt:at}).where(and(eq(records.id,grant.consentRecordId),eq(records.status,"captured")));
            await writeAudit(s,actor,"revoke_caregiver_grant_contact_change",grant.id,patientId,{reason,contactId:old.id});
          }
        }
      }
      await s.delete(patientContacts).where(eq(patientContacts.patientId, patientId));
      if (input.contacts.length) await s.insert(patientContacts).values(input.contacts.map(c => ({...c, id: c.id ?? id(), patientId, sharingScope: c.sharingAllowed ? c.sharingScope ?? [] : [], consentRecordedAt: c.sharingAllowed ? c.consentRecordedAt : null, updatedAt: at})));
    }
    if (input.identifiers) {
      assertIds(input.identifiers, before.identifiers);
      unique(input.identifiers.map(i => `${i.system.trim()}:${i.value.trim()}`), "patient identifiers");
      await s.delete(patientIdentifiers).where(eq(patientIdentifiers.patientId, patientId));
      if (input.identifiers.length) await s.insert(patientIdentifiers).values(input.identifiers.map(i => ({...i, id: i.id ?? id(), patientId, system: i.system.trim(), value: i.value.trim(), updatedAt: at})));
    }
    const conditions = input.conditions?.filter(c => c.clinicalStatus === "active").map(c => c.display.trim());
    const medications = input.medications?.filter(m => m.status === "active").map(m => `${m.name.trim()} ${m.dose.trim()} ${m.route} ${m.frequency.trim()}`);
    const coverage = input.coverage?.find(c => c.status === "active");
    await s.update(patients).set({ ...(conditions ? {conditions} : {}), ...(medications ? {medications} : {}), ...(input.coverage ? {payer: coverage?.payer??""} : {}), updatedAt: at }).where(eq(patients.id, patientId));
    const after = await clinicalProfile(s, patientId);
    await writeAudit(s, actor, "update_clinical_profile", patientId, patientId, {sections: Object.keys(input).filter(k => k !== "expectedUpdatedAt"), before, after});
    return after;
  });
}
