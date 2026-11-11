import {pgTable,text,jsonb,timestamp,uniqueIndex,index} from "drizzle-orm/pg-core";
import {users} from "./auth";

export const programPolicies=pgTable("care_program_policies",{
  id:text("id").primaryKey(),
  kind:text("kind").notNull(),
  program:text("program").notNull(),
  version:text("version").notNull(),
  payer:text("payer").notNull().default(""),
  effectiveFrom:text("effective_from").notNull(),
  status:text("status").notNull().default("draft"),
  body:jsonb("body").$type<Record<string,unknown>>().notNull(),
  sourceRef:text("source_ref").notNull().default(""),
  reviewNote:text("review_note").notNull().default(""),
  createdBy:text("created_by").notNull().references(()=>users.id),
  reviewedBy:text("reviewed_by").references(()=>users.id),
  reviewedAt:timestamp("reviewed_at",{withTimezone:true}),
  publishedAt:timestamp("published_at",{withTimezone:true}),
  retiredAt:timestamp("retired_at",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("care_policy_version").on(t.kind,t.program,t.payer,t.version),
  index("care_policy_selection").on(t.kind,t.program,t.payer,t.status,t.effectiveFrom),
]);
export type ProgramPolicyRow=typeof programPolicies.$inferSelect;
