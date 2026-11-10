import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATA_CLASS: z.literal("synthetic").default("synthetic"),
});
export const config = schema.parse(process.env);
