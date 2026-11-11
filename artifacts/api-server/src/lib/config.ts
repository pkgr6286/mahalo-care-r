import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATA_CLASS: z.literal("synthetic").default("synthetic"),
  SESSION_SECRET: z.string().min(16),
  WORKER_INTERVAL_MS: z.coerce.number().int().min(250).default(2000),
});
export const config = schema.parse(process.env);
