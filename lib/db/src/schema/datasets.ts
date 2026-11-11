import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

/** Sidecar classification preserves immutable signed records and their original metadata. */
export const datasetMemberships = pgTable("care_dataset_memberships", {
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  dataset: text("dataset").notNull(),
  reason: text("reason").notNull(),
  classifiedAt: timestamp("classified_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.entityType, t.entityId] }),
  index("care_dataset_kind").on(t.entityType, t.dataset),
]);
export const insertDatasetMembershipSchema = createInsertSchema(datasetMemberships).omit({ classifiedAt: true });
export type DatasetMembershipRow = typeof datasetMemberships.$inferSelect;
