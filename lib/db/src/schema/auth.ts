import { pgTable, text, timestamp, jsonb, integer,check } from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";
export type EmergencyContext={patientId:string;patientName:string;mrn:string;location:string;reason:string;startedAt:string;expiresAt:string};
import { patients } from "./patients";

export const users = pgTable("care_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  credential: text("credential").notNull().default("RN"),
  patientId: text("patient_id").references(() => patients.id),
  status: text("status").notNull().default("active"),
  locationScopes: jsonb("location_scopes").$type<string[]>().notNull().default([]),
  siteRoles: jsonb("site_roles").$type<Record<string,string>>().notNull().default({}),
  npi: text("npi"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
},t=>[
  check("care_user_site_roles_object",sql`jsonb_typeof(${t.siteRoles})='object'`),
  check("care_user_npi_format",sql`${t.npi} IS NULL OR ${t.npi} ~ '^[12][0-9]{9}$'`),
]);

export const passwordTokens = pgTable("care_password_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  purpose: text("purpose").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("care_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  activeLocation: text("active_location"),
  emergencyContext: jsonb("emergency_context").$type<EmergencyContext>(),
});
