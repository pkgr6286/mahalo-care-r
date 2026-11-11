import {createHash} from "node:crypto";
import {eq,sql} from "drizzle-orm";
import pLimit from "p-limit";
import {db,pool,documents} from "@workspace/db";
import {uploadPrivateDocument,downloadPrivateDocument} from "./lib/document-object-store";
import {documentSourceHash} from "./lib/document-renderer";
import {writeAudit} from "./lib/store";
import {systemActor} from "./lib/device-ingestion";

// Development-only, explicitly approved one-way copy. Does not change any clinical version, byte hash or source snapshot.
async function main() {
  const legacy=await db.select().from(documents).where(eq(documents.storageBackend,"postgres_local_demo"));
  let migrated=0,bytes=0;
  const limit=pLimit(4);
  await Promise.all(legacy.map(original=>limit(async()=>{
    if(!original.pdfBytes||createHash("sha256").update(original.pdfBytes).digest("hex")!==original.sha256||documentSourceHash(original.sourceSnapshot)!==original.sourceHash)throw new Error("A legacy document failed integrity verification; its database bytes were preserved");
    const stored=await uploadPrivateDocument(original.id,original.createdBy,original.pdfBytes,original.sha256);
    await downloadPrivateDocument(stored.objectPath,stored.generation,original.size,original.sha256);
    await db.transaction(async s=>{
      await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
      const [current]=await s.select().from(documents).where(eq(documents.id,original.id)).for("update");
      if(current?.storageBackend==="app_storage_private")return;
      if(!current||current.sha256!==original.sha256||current.sourceHash!==original.sourceHash)throw new Error("Document changed during the private-storage move; source bytes were preserved");
      await s.update(documents).set({...stored,pdfBytes:null}).where(eq(documents.id,original.id));
      await writeAudit(s,systemActor,"migrate_document_storage",original.recordId,original.patientId,{documentId:original.id,sha256:original.sha256,from:"postgres_local_demo",to:stored.storageBackend});
      migrated++;bytes+=original.size;
    });
  })));
  const result=await pool.query("SELECT count(*)::int AS legacy_rows, count(pdf_bytes)::int AS database_blobs FROM care_documents WHERE storage_backend<>'app_storage_private' OR pdf_bytes IS NOT NULL");
  console.log(JSON.stringify({migrated,bytes,remainingLegacy:result.rows[0].legacy_rows,remainingDatabaseBlobs:result.rows[0].database_blobs,exactBytesAndSourceHashesVerified:true}));
  if(result.rows[0].legacy_rows!==0)throw new Error("Some legacy documents still need migration");
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Private document migration failed");process.exitCode=1;}).finally(()=>pool.end());
