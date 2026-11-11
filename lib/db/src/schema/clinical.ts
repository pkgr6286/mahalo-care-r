import { boolean, date, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { patients } from "./patients";

/** Structured clinical facts. Care-plan/note versions retain their own immutable snapshots. */
export const patientConditions = pgTable("care_patient_conditions", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull().references(() => patients.id),
  code: text("code").notNull(),
  codeSystem: text("code_system").notNull().default("ICD-10-CM"),
  display: text("display").notNull(),
  onsetDate: date("onset_date", { mode: "string" }),
  chronic: boolean("chronic").notNull().default(true),
  clinicalStatus: text("clinical_status").notNull().default("active"),
  source: text("source").notNull().default("clinician"),
  recordedBy: text("recorded_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("care_condition_patient").on(t.patientId), uniqueIndex("care_condition_code").on(t.patientId, t.codeSystem, t.code)]);
export const insertPatientConditionSchema = createInsertSchema(patientConditions).omit({ updatedAt: true });
export type PatientConditionRow = typeof patientConditions.$inferSelect;

export const patientMedications = pgTable("care_patient_medications", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull().references(() => patients.id),
  name: text("name").notNull(),
  rxnormCode: text("rxnorm_code"),
  dose: text("dose").notNull(),
  route: text("route").notNull().default("oral"),
  frequency: text("frequency").notNull(),
  indication: text("indication").notNull().default(""),
  status: text("status").notNull().default("active"),
  startedOn: date("started_on", { mode: "string" }),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  reconciledBy: text("reconciled_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("care_medication_patient").on(t.patientId)]);
export const insertPatientMedicationSchema = createInsertSchema(patientMedications).omit({ updatedAt: true });
export type PatientMedicationRow = typeof patientMedications.$inferSelect;

export const patientCoverage = pgTable("care_patient_coverage", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull().references(() => patients.id),
  payer: text("payer").notNull(),
  plan: text("plan").notNull(),
  memberId: text("member_id").notNull(),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  effectiveTo: date("effective_to", { mode: "string" }),
  status: text("status").notNull().default("active"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("care_coverage_patient").on(t.patientId)]);
export const insertPatientCoverageSchema = createInsertSchema(patientCoverage).omit({ updatedAt: true });
export type PatientCoverageRow = typeof patientCoverage.$inferSelect;

export const patientContacts = pgTable("care_patient_contacts", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull().references(() => patients.id),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  emergency: boolean("emergency").notNull().default(false),
  sharingAllowed: boolean("sharing_allowed").notNull().default(false),
  sharingScope: jsonb("sharing_scope").$type<string[]>().notNull().default([]),
  consentRecordedAt: timestamp("consent_recorded_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("care_contact_patient").on(t.patientId)]);
export const insertPatientContactSchema = createInsertSchema(patientContacts).omit({ updatedAt: true });
export type PatientContactRow = typeof patientContacts.$inferSelect;

export const patientIdentifiers = pgTable("care_patient_identifiers", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull().references(() => patients.id),
  system: text("system").notNull(),
  value: text("value").notNull(),
  source: text("source").notNull().default("practice"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("care_identifier_patient").on(t.patientId), uniqueIndex("care_identifier_unique").on(t.system, t.value)]);
export const insertPatientIdentifierSchema = createInsertSchema(patientIdentifiers).omit({ updatedAt: true });
export type PatientIdentifierRow = typeof patientIdentifiers.$inferSelect;
