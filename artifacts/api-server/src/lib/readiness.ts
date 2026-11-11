import { pool } from "@workspace/db";
import {config} from "./config";

const requiredTables = ["care_patients","care_records","care_users","care_sessions","care_jobs","care_documents","care_attachments","care_dataset_memberships","care_patient_conditions","care_patient_medications","care_patient_coverage","care_patient_contacts","care_patient_identifiers","care_caregiver_grants","care_settings","care_audit","care_program_policies","care_ingest_inbox","care_password_tokens","care_user_preferences","care_one_open_rule_exception","care_audit_at"];
const requiredFunctions = ["care_time_guard()","care_protect_signed_record()","care_protect_document()","care_safe_timestamp(text)","care_audit_immutable()","care_policy_guard()","protect_care_attachment()"];
const requiredTriggers=[["care_attachments","protect_care_attachment"],["care_audit","care_audit_no_change"],["care_documents","care_document_protection"],["care_program_policies","care_program_policy_guard"],["care_records","care_clinical_signature_guard"],["care_records","care_records_time_guard"]];
const requiredColumns=[["care_users","site_roles"],["care_users","npi"],["care_sessions","active_location"],["care_sessions","emergency_context"]];
export async function assertClinicalSchema() {
  const statement = {
    text: "SELECT name,to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS name UNION ALL SELECT name,to_regprocedure(name) IS NOT NULL AS present FROM unnest($2::text[]) AS name UNION ALL SELECT t.table_name||'.'||t.trigger_name,EXISTS(SELECT 1 FROM pg_trigger g WHERE g.tgrelid=to_regclass(t.table_name) AND g.tgname=t.trigger_name AND g.tgenabled IN ('O','A')) FROM unnest($3::text[],$4::text[]) AS t(table_name,trigger_name) UNION ALL SELECT 'valid_unique_open_alert_index',EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('care_one_open_rule_exception') AND indisunique AND indisvalid) UNION ALL SELECT c.table_name||'.'||c.column_name,EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(c.table_name) AND a.attname=c.column_name AND a.attnum>0 AND NOT a.attisdropped) FROM unnest($5::text[],$6::text[]) AS c(table_name,column_name)",
    values: [requiredTables, requiredFunctions,requiredTriggers.map(t=>t[0]),requiredTriggers.map(t=>t[1]),requiredColumns.map(c=>c[0]),requiredColumns.map(c=>c[1])], query_timeout: 3000,
  };
  const result = await pool.query<{name:string;present:boolean}>(statement);
  const missing = result.rows.filter(r => !r.present).map(r => r.name);
  if (missing.length) throw new Error(`Required application schema is missing: ${missing.join(", ")}. Apply the development schema; for managed production use the Publish schema flow.`);
}
export async function dependencyReadiness() {
  const started = Date.now();
  await assertClinicalSchema();
  const statement={ text: "SELECT count(*) AS due,min(run_at) AS oldest FROM care_jobs WHERE status IN ('queued','retry') AND run_at <= now()", query_timeout: 1500 };
  const result = await pool.query<{due:string;oldest:Date|null}>(statement);
  const queued = Number(result.rows[0]?.due ?? 0), oldest = result.rows[0]?.oldest;
  const heartbeatQuery={text:"SELECT value FROM care_settings WHERE id='system.worker.heartbeat'",query_timeout:1500};
  const pulse=await pool.query<{value:{seenAt?:string;mode?:string}}>(heartbeatQuery);
  const heartbeat=pulse.rows[0]?.value;
  const heartbeatAge=heartbeat?.seenAt?Date.now()-Date.parse(heartbeat.seenAt):Infinity;
  const workerHealthy=Number.isFinite(heartbeatAge)&&heartbeatAge>=-5000&&heartbeatAge<120000;
  return {
    status: !workerHealthy||queued && oldest && Date.now()-oldest.getTime()>300000 ? "degraded" : "ready",
    dataClass: "synthetic",
    database: {status:"ready",latencyMs:Date.now()-started},
    schema: "ready",
    worker: {mode:config.WORKER_MODE,status:workerHealthy?"recent_heartbeat":"missing_or_stale_heartbeat",lastSeenAt:heartbeat?.seenAt??null,dueJobs:queued,oldestDueAt:oldest?.toISOString()??null,continuousExecutionRequired:true},
    storage: {configured: Boolean(process.env.PRIVATE_OBJECT_DIR),connectivity:"not_checked_by_probe"},
  };
}
