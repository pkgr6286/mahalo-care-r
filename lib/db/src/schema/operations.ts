import { pgTable, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";

export const jobs = pgTable("care_jobs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  status: text("status").notNull().default("queued"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("care_jobs_due_idx").on(t.status,t.runAt)]);

export const ingestInbox = pgTable("care_ingest_inbox", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  eventId: text("event_id").notNull().unique(),
  deviceId: text("device_id").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("received"),
  signatureValid: text("signature_valid").notNull(),
  receivedAt: timestamp("received_at", {withTimezone:true}).notNull().defaultNow(),
  processedAt: timestamp("processed_at", {withTimezone:true}),
  error: text("error"),
});
