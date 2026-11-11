import {pgTable,text,integer,timestamp,uniqueIndex,index,jsonb,customType} from "drizzle-orm/pg-core";
import {Buffer} from "node:buffer";
import {patients} from "./patients";
import {records} from "./records";
import {users} from "./auth";
const bytes=customType<{data:Buffer;driverData:Buffer}>({dataType:()=>"bytea",toDriver:value=>value,fromDriver:value=>Buffer.from(value)});
export const documents=pgTable("care_documents",{
  id:text("id").primaryKey(),
  recordId:text("record_id").notNull().references(()=>records.id),
  patientId:text("patient_id").references(()=>patients.id),
  version:integer("version").notNull(),
  sourceVersion:text("source_version").notNull().default("1"),
  eventKey:text("event_key").notNull(),
  origin:text("origin").notNull(),
  objectPath:text("object_path").notNull().unique(),
  generation:text("generation").notNull(),
  sha256:text("sha256").notNull(),
  sourceHash:text("source_hash").notNull(),
  storageBackend:text("storage_backend").notNull().default("app_storage_private"),
  // Read-only compatibility during the one-way move to private object storage; new rows must be null.
  pdfBytes:bytes("pdf_bytes"),
  sourceSnapshot:jsonb("source_snapshot").$type<Record<string,unknown>>().notNull(),
  size:integer("size").notNull(),
  contentType:text("content_type").notNull().default("application/pdf"),
  createdBy:text("created_by").notNull().references(()=>users.id),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex("care_document_event").on(t.recordId,t.eventKey),uniqueIndex("care_document_version").on(t.recordId,t.version),index("care_document_patient").on(t.patientId)]);
export type DocumentRow=typeof documents.$inferSelect;
