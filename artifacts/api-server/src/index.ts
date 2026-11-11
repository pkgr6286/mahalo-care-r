import app from "./app";
import { logger } from "./lib/logger";
import { config } from "./lib/config";
import { seedDemo, ensurePatientDemoAccount } from "./lib/seed";
import { installDemoAuditProtection } from "./lib/audit-protection";
import { pool } from "@workspace/db";
import { startWorker } from "./lib/worker";
import { installTimeProtection } from "./lib/time-protection";
import {installPolicyProtection} from "./lib/policy-protection";
import {ensureClinicalRuleDefaults} from "./lib/default-clinical-rules";
import {installExceptionProtection} from "./lib/exception-protection";
import {installWorklistSupport} from "./lib/worklist-query";
import {ensureStaffDemoAccounts} from "./lib/demo-staff";
import {installDocumentProtection} from "./lib/document-store";
import {installSignatureProtection} from "./lib/signature-protection";
import {ensureEducationDefaults} from "./lib/default-education";
import {installAttachmentSupport} from "./lib/attachment-support";

await installDemoAuditProtection();
await seedDemo();
await installTimeProtection();
await installPolicyProtection();
await ensurePatientDemoAccount();
await ensureStaffDemoAccounts();
await ensureEducationDefaults();
await ensureClinicalRuleDefaults();
await installExceptionProtection();
await installWorklistSupport();
await installDocumentProtection();
await installSignatureProtection();
await installAttachmentSupport();
const port = config.PORT;
const stopWorker=startWorker();
const server=app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
process.on("SIGTERM",()=>server.close(()=>{void stopWorker().then(()=>pool.end()).then(()=>process.exit(0));}));
