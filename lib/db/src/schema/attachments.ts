import {pgTable,text,integer,timestamp,index} from "drizzle-orm/pg-core";
import {createInsertSchema} from "drizzle-zod";
import {patients} from "./patients";
export const attachments=pgTable("care_attachments",{
  id:text("id").primaryKey(),patientId:text("patient_id").notNull().references(()=>patients.id),
  filename:text("filename").notNull(),sizeBytes:integer("size_bytes").notNull(),mimeType:text("mime_type").notNull(),
  status:text("status").notNull().default("awaiting_upload"),sha256:text("sha256"),objectPath:text("object_path"),generation:text("generation"),
  uploadedById:text("uploaded_by_id").notNull(),uploadedByName:text("uploaded_by_name").notNull(),
  reviewedById:text("reviewed_by_id"),reviewedByName:text("reviewed_by_name"),reviewedAt:timestamp("reviewed_at",{withTimezone:true}),
  reviewReason:text("review_reason"),validationError:text("validation_error"),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("care_attachments_patient_idx").on(t.patientId,t.createdAt)]);
export const insertAttachmentSchema=createInsertSchema(attachments);
export type AttachmentRow=typeof attachments.$inferSelect;
