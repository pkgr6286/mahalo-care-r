import app from "./app";
import { logger } from "./lib/logger";
import { config } from "./lib/config";
import { seedDemo, ensurePatientDemoAccount } from "./lib/seed";
import { installDemoAuditProtection } from "./lib/audit-protection";
import { pool } from "@workspace/db";

await installDemoAuditProtection();
await seedDemo();
await ensurePatientDemoAccount();
const port = config.PORT;
const server=app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
process.on("SIGTERM",()=>server.close(()=>{void pool.end().then(()=>process.exit(0));}));
