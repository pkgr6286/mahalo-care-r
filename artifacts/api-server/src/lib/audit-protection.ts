import {sql} from "drizzle-orm";
import {db} from "@workspace/db";

/** Demo bootstrap. A least-privilege production migration must install this separately. */
export async function installDemoAuditProtection() {
  await db.execute(sql`CREATE OR REPLACE FUNCTION care_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit records are append-only'; END; $$`);
  await db.execute(sql`CREATE OR REPLACE TRIGGER care_audit_no_change BEFORE UPDATE OR DELETE ON care_audit FOR EACH ROW EXECUTE FUNCTION care_audit_immutable()`);
}
