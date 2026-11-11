import app from "./app";
import { logger } from "./lib/logger";
import { config } from "./lib/config";
import { pool } from "@workspace/db";
import { startWorker } from "./lib/worker";
import { assertClinicalSchema } from "./lib/readiness";

// Schema changes belong to the development schema workflow and Publish, never API startup.
await assertClinicalSchema();
const port = config.PORT;
const stopWorker=config.WORKER_MODE==="embedded"?startWorker():async()=>{};
const server=app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
let shuttingDown=false;
const shutdown=()=>{
  if(shuttingDown)return;shuttingDown=true;
  const deadline=setTimeout(()=>{logger.error("Graceful shutdown deadline exceeded");process.exit(1);},25000);deadline.unref();
  server.close(()=>{void stopWorker().then(()=>pool.end()).then(()=>process.exit(0));});
};
process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);
