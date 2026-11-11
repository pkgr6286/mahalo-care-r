import assert from "node:assert/strict";
import {db,pool,documents} from "@workspace/db";
import {eq} from "drizzle-orm";
import {downloadPrivateDocument} from "./lib/document-object-store";
try{
  const [doc]=await db.select().from(documents).where(eq(documents.storageBackend,"app_storage_private")).limit(1);
  assert.ok(doc,"A retained private document is required for this read-only check");assert.ok(doc.generation);
  // Prove this exact object exists and its authenticated server-side bytes match the retained hash.
  const verified=await downloadPrivateDocument(doc.objectPath,doc.generation,doc.size,doc.sha256);assert.equal(verified.length,doc.size);
  const [bucket,...prefix]=(process.env.PRIVATE_OBJECT_DIR??"").replace(/^\/+/,"").replace(/\/+$/,"").split("/");
  assert.ok(bucket&&prefix.length);
  const name=prefix.join("/")+"/"+doc.objectPath.slice("/objects/".length);
  // No cookies, service credentials or signed query parameters; do not print private bucket/object identifiers.
  const anonymous=await fetch(`https://storage.googleapis.com/${encodeURIComponent(bucket!)}/${name.split("/").map(encodeURIComponent).join("/")}`,{signal:AbortSignal.timeout(15000)});
  assert.ok([401,403,404].includes(anonymous.status),`Anonymous object access must be denied; received status ${anonymous.status}`);
  console.log("PASS private storage boundary: pinned authenticated bytes verified; unsigned anonymous cloud access denied.");
}finally{await pool.end();}
