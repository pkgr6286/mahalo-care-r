import { pgTable,text,timestamp,jsonb,index,uniqueIndex,check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { patients } from "./patients";
import { users } from "./auth";
import { records } from "./records";

export const caregiverGrants=pgTable("care_caregiver_grants",{
  id:text("id").primaryKey(),
  userId:text("user_id").notNull().references(()=>users.id),
  patientId:text("patient_id").notNull().references(()=>patients.id),
  // Logical reference: removing a contact must deny access without deleting the retained grant history.
  contactId:text("contact_id").notNull(),
  scopes:jsonb("scopes").$type<string[]>().notNull(),
  status:text("status").notNull().default("active"),
  consentRecordId:text("consent_record_id").notNull().references(()=>records.id),
  method:text("method").notNull(),
  grantedBy:text("granted_by").notNull().references(()=>users.id),
  grantedAt:timestamp("granted_at",{withTimezone:true}).notNull().defaultNow(),
  expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
  revokedAt:timestamp("revoked_at",{withTimezone:true}),
  reason:text("reason").notNull().default(""),
},t=>[
  index("care_caregiver_grants_patient").on(t.patientId,t.status),
  uniqueIndex("care_caregiver_grants_active_unique").on(t.userId,t.patientId).where(sql`${t.status}='active'`),
  check("care_caregiver_grants_status",sql`${t.status} IN ('active','revoked')`),
  check("care_caregiver_grants_scopes",sql`jsonb_typeof(${t.scopes})='array' AND jsonb_array_length(${t.scopes})>0`),
]);
export type CaregiverGrantRow=typeof caregiverGrants.$inferSelect;
