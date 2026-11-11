import {sql} from "drizzle-orm";
import {db} from "@workspace/db";
export async function installExceptionProtection() {
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS care_one_open_rule_exception ON care_records(patient_id,(metadata->>'ruleId')) WHERE kind='exceptions' AND status IN ('open','acknowledged') AND metadata->>'ruleId' IS NOT NULL`);
}
