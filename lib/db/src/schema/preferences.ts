import {pgTable,text,jsonb,timestamp} from "drizzle-orm/pg-core";
import {users} from "./auth";
export const userPreferences=pgTable("care_user_preferences",{
  userId:text("user_id").primaryKey().references(()=>users.id),
  value:jsonb("value").$type<Record<string,unknown>>().notNull().default({}),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
});
