import { pool } from "@workspace/db";
import { seedClinicalPractice, retainClinicalDemoDocuments, calculateClinicalDemoBilling } from "./lib/seed-clinical-practice";
import { logger } from "./lib/logger";

try {
  const data = await seedClinicalPractice();
  logger.info({scenarioCount:data.scenarioCount,alreadyPrepared:"alreadyPrepared" in data,documentsPending:data.documentsPending}, "Clinical demonstration dataset is ready");
  if (!process.argv.includes("--data-only")) {
    logger.info(await retainClinicalDemoDocuments(), "Clinical PDFs retained privately");
    const lines = await calculateClinicalDemoBilling();
    logger.info({ lines: lines.length, candidates: lines.filter(l => l.status === "candidate").length }, "Clinical evidence calculated");
  }
} catch (error) {
  logger.error({ error }, "Clinical demonstration preparation did not finish");
  process.exitCode = 1;
} finally {
  await pool.end();
}
