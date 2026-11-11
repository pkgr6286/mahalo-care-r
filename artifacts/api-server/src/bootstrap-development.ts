import { pool } from "@workspace/db";
import { config } from "./lib/config";
import { installDemoAuditProtection } from "./lib/audit-protection";
import { installTimeProtection } from "./lib/time-protection";
import { installPolicyProtection } from "./lib/policy-protection";
import { installExceptionProtection } from "./lib/exception-protection";
import { installWorklistSupport } from "./lib/worklist-query";
import { installDocumentProtection } from "./lib/document-store";
import { installSignatureProtection } from "./lib/signature-protection";
import { installAttachmentSupport } from "./lib/attachment-support";
import { seedDemo, ensurePatientDemoAccount } from "./lib/seed";
import { ensureStaffDemoAccounts } from "./lib/demo-staff";
import { logger } from "./lib/logger";

if (config.NODE_ENV !== "development") throw new Error("This command is development-only. Managed production schema changes belong to Publish.");
try {
  await installDemoAuditProtection();
  await installTimeProtection();
  await installPolicyProtection();
  await installExceptionProtection();
  await installWorklistSupport();
  await installDocumentProtection();
  await installSignatureProtection();
  await installAttachmentSupport();
  await seedDemo();
  await ensurePatientDemoAccount();
  await ensureStaffDemoAccounts();
  logger.info("Development-only integrity guards and initial demonstration accounts prepared");
} finally { await pool.end(); }
