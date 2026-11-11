import { sql, type SQL } from "drizzle-orm";
import { datasetMemberships, records, patients, users, programPolicies } from "@workspace/db";

/** Default clinical views never mix retained regression fixtures into patient care. */
export const clinicalPatient = sql`${patients.dataset} = 'clinical'`;
export const clinicalRecord = sql`NOT EXISTS (
  SELECT 1 FROM ${datasetMemberships} d
  WHERE d.entity_type = 'record' AND d.entity_id = ${records.id} AND d.dataset IN ('legacy','validation')
) AND (${records.patientId} IS NULL OR EXISTS (SELECT 1 FROM ${patients} p WHERE p.id=${records.patientId} AND p.dataset='clinical'))`;
export const clinicalAccount = sql`NOT EXISTS (
  SELECT 1 FROM ${datasetMemberships} d
  WHERE d.entity_type = 'user' AND d.entity_id = ${users.id} AND d.dataset IN ('legacy','validation')
)`;
export const clinicalPolicy = sql`NOT EXISTS (
  SELECT 1 FROM ${datasetMemberships} d
  WHERE d.entity_type = 'policy' AND d.entity_id = ${programPolicies.id} AND d.dataset IN ('legacy','validation')
)`;
export function clinicalPatientFor(alias: SQL) {
  return sql`${alias} = 'clinical'`;
}
