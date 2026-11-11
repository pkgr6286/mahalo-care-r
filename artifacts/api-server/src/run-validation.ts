import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { db, pool, datasetMemberships, patients } from "@workspace/db";
import { and,eq,sql } from "drizzle-orm";
import { config } from "./lib/config";

if(config.NODE_ENV!=="development"||config.DATA_CLASS!=="synthetic")throw new Error("Local validation runs require synthetic development data.");
const supported=["api","access","policies","rules","worklists","documents","ai","workflow-operations","contact-ehr","attachments","clinical","caregivers","site-access","emergency-access","security-reports","patient-import"];
const selected=process.argv.slice(2);
const tests=selected.length?selected:supported;
if(tests.some(t=>!supported.includes(t)))throw new Error("Unknown validation suite.");
let failed=false;
try {
  for(const suite of tests) {
    const run=randomUUID();
    try {
      const exit=await new Promise<number>(resolve=>{
        const child=spawn("pnpm",["exec","tsx",`src/check-${suite}.ts`,`--validation-run=${run}`],{stdio:"inherit"});
        child.on("error",()=>resolve(1));child.on("exit",code=>resolve(code??1));
      });
      if(exit)failed=true;
    } finally {
      await db.transaction(async s=>{
        const rows=await s.select().from(datasetMemberships).where(and(eq(datasetMemberships.reason,`Local validation ${run}`),eq(datasetMemberships.dataset,"validation_pending")));
        for(const row of rows)if(row.entityType==="patient")await s.update(patients).set({dataset:"validation"}).where(eq(patients.id,row.entityId));
        await s.update(datasetMemberships).set({dataset:"validation"}).where(and(eq(datasetMemberships.reason,`Local validation ${run}`),eq(datasetMemberships.dataset,"validation_pending")));
        console.log(`${suite}: retained ${rows.length} validation fixtures outside clinical presentation`);
      });
    }
  }
} finally { await pool.end(); }
if(failed)process.exitCode=1;
