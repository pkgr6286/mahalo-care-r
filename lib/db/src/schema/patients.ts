import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const patients = pgTable("care_patients", {
  id: text("id").primaryKey(),
  mrn: text("mrn").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dob: text("dob").notNull(),
  sex: text("sex").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  location: text("location").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  status: text("status").notNull().default("active"),
  conditions: jsonb("conditions").$type<string[]>().notNull().default([]),
  medications: jsonb("medications").$type<string[]>().notNull().default([]),
  payer: text("payer").notNull().default("Medicare"),
  careManager: text("care_manager").notNull().default("Sarah Mitchell"),
  communicationPreferences: jsonb("communication_preferences").$type<{email:boolean;sms:boolean;push:boolean;quietHours?:{enabled:boolean;start:string;end:string}}>().notNull().default({email:true,sms:true,push:true}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PatientRow = typeof patients.$inferSelect;
