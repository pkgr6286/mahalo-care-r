import {pool} from "@workspace/db";
import {installDemoAuditProtection} from "./lib/audit-protection";
import {installTimeProtection} from "./lib/time-protection";
import {installPolicyProtection} from "./lib/policy-protection";
import {installExceptionProtection} from "./lib/exception-protection";
import {installWorklistSupport} from "./lib/worklist-query";
import {installDocumentProtection} from "./lib/document-store";
import {installSignatureProtection} from "./lib/signature-protection";
import {installAttachmentSupport} from "./lib/attachment-support";

// This is an explicit deployment step, never an application-startup side effect.
try{
  if(!process.argv.includes("--approve-integrity-install"))throw new Error("approval_required");
  await installDemoAuditProtection();
  await installTimeProtection();
  await installPolicyProtection();
  await installExceptionProtection();
  await installWorklistSupport();
  await installDocumentProtection();
  await installSignatureProtection();
  await installAttachmentSupport();
  console.log("Database integrity guards installed. No demonstration accounts or clinical scenarios were seeded.");
}catch(error){
  const code=error instanceof Error&&error.message==="approval_required"?"approval_required":error&&typeof error==="object"&&"code"in error&&/^[A-Z0-9]{5}$/.test(String(error.code))?String(error.code):"installation_failed";
  console.error("Integrity installation did not complete.",{code,instruction:"Confirm the target database, apply the reviewed Drizzle schema, and supply --approve-integrity-install using a migration identity. Never use this command as application startup."});
  process.exitCode=1;
}finally{await pool.end();}
