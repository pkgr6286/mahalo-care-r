import { pgTable, text, timestamp, jsonb, doublePrecision, index } from "drizzle-orm/pg-core";
import { patients } from "./patients";

export const records = pgTable("care_records", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  patientId: text("patient_id").references(() => patients.id),
  program: text("program"),
  title: text("title").notNull(),
  status: text("status").notNull().default("active"),
  severity: text("severity").notNull().default("low"),
  description: text("description").notNull().default(""),
  assignee: text("assignee").notNull().default("Sarah Mitchell"),
  date: text("date").notNull(),
  value: doublePrecision("value").notNull().default(0),
  unit: text("unit").notNull().default(""),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text("created_by").notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("care_records_kind").on(t.kind, t.status),
  index("care_records_patient").on(t.patientId, t.kind),
]);
export type RecordRow = typeof records.$inferSelect;

export const settings = pgTable("care_settings", {
  id: text("id").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
});

export const audit = pgTable("care_audit", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  entityId: text("entity_id").notNull(),
  patientId: text("patient_id"),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
