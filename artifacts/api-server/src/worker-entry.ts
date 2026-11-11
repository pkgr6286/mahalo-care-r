import {createServer} from "node:http";
import {pool} from "@workspace/db";
import {config} from "./lib/config";
import {logger} from "./lib/logger";
import {assertClinicalSchema,dependencyReadiness} from "./lib/readiness";
import {startWorker} from "./lib/worker";

// Same durable Postgres queue as the embedded worker. No schema changes or seeds.
await assertClinicalSchema();
const stop=startWorker("standalone");
let closing=false;
const server=createServer((req,res)=>{
  const path=req.url?.split("?")[0];
  res.setHeader("Content-Type","application/json");
  res.setHeader("Cache-Control","no-store");
  if(path==="/healthz"){res.end(JSON.stringify({status:closing?"stopping":"ok",service:"worker",dataClass:"synthetic"}));return;}
  if(path!=="/readyz"){res.statusCode=404;res.end(JSON.stringify({error:"Not found"}));return;}
  void dependencyReadiness().then(result=>{
    res.statusCode=result.status==="ready"?200:503;res.end(JSON.stringify(result));
  }).catch(error=>{
    logger.warn({errorType:error instanceof Error?error.name:"unknown"},"Worker readiness check failed");
    res.statusCode=503;res.end(JSON.stringify({status:"not_ready",error:"A worker dependency is unavailable"}));
  });
});
server.listen(config.PORT,"0.0.0.0",()=>logger.info({port:config.PORT},"Standalone worker listening"));
const shutdown=()=>{
  if(closing)return;closing=true;
  const deadline=setTimeout(()=>{logger.error("Worker shutdown deadline exceeded");process.exit(1);},25000);deadline.unref();
  server.close(()=>{void stop().then(()=>pool.end()).then(()=>process.exit(0));});
};
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
