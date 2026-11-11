import { db, pool, datasetMemberships, patients } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { config } from "./lib/config";

const run=process.argv[2];
if(config.NODE_ENV!=="development"||config.DATA_CLASS!=="synthetic"||!run||!/^[0-9a-f-]{36}$/.test(run))throw new Error("Provide a local synthetic validation-run UUID.");
try{
  await db.transaction(async s=>{
    const where=and(eq(datasetMemberships.reason,`Local validation ${run}`),eq(datasetMemberships.dataset,"validation_pending"));
    const rows=await s.select().from(datasetMemberships).where(where);
    for(const row of rows)if(row.entityType==="patient")await s.update(patients).set({dataset:"validation"}).where(eq(patients.id,row.entityId));
    await s.update(datasetMemberships).set({dataset:"validation"}).where(where);
    console.log(`Retained ${rows.length} browser validation fixtures outside clinical presentation; no records were deleted.`);
  });
}finally{await pool.end();}
