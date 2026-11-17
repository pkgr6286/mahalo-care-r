import type { CareRecord } from "@workspace/api-client-react";

export interface PatientBloodPressure {
  id: string;
  systolic: number;
  diastolic: number;
  unit: "mmHg";
  timestamp: string;
  timeKind: "measured" | "recorded";
}

const numericInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

function isConnectedObservation(record: CareRecord) {
  const source = String(record.metadata?.source ?? "").toLowerCase();
  return record.kind === "observations"
    && record.status !== "invalid" && record.status !== "voided" && record.metadata?.valid !== false
    && (source === "cellular" || (source === "device" && record.metadata?.deviceCleared === true))
    && record.unit === "mmHg";
}

function isSystolic(record: CareRecord) {
  const loinc = record.metadata?.loinc;
  // Older seed/simulateReading records have no LOINC, but do identify BP by title.
  return loinc === "8480-6" || (!loinc && record.title.trim().toLowerCase() === "blood pressure");
}

function timestamp(record: CareRecord) {
  const value = record.date || record.createdAt;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

function componentKey(record: CareRecord) {
  const deviceId = record.metadata?.deviceId;
  // A shared timestamp is not enough evidence to join clinical measurements.
  if (typeof deviceId !== "string" || !deviceId || !record.patientId || !record.date || !timestamp(record)) return undefined;
  return JSON.stringify([
    record.patientId, record.program, deviceId, record.metadata?.inboxId ?? null,
    String(record.metadata?.source).toLowerCase(), Date.parse(record.date),
  ]);
}

/** Read-only projection; never fills in a missing pressure or changes source records. */
export function selectPatientBloodPressure(records: readonly CareRecord[]): PatientBloodPressure[] {
  const eligible = records.filter(isConnectedObservation);
  const components = new Map<string, CareRecord[]>();
  const systolicCounts = new Map<string, number>();
  for (const record of eligible) {
    const key = componentKey(record);
    if (!key) continue;
    if (isSystolic(record)) systolicCounts.set(key, (systolicCounts.get(key) ?? 0) + 1);
    if (record.metadata?.loinc === "8462-4" && numericInRange(record.value, 20, 200)) {
      components.set(key, [...(components.get(key) ?? []), record]);
    }
  }
  const readings: PatientBloodPressure[] = [];
  for (const record of eligible) {
    if (!isSystolic(record) || !numericInRange(record.value, 30, 300)) continue;
    const at = timestamp(record);
    if (!at) continue;
    let diastolic = record.metadata?.diastolic;
    // Only a missing component can be joined; an explicitly invalid value stays invalid.
    if (diastolic === undefined || diastolic === null) {
      const key = componentKey(record);
      const matches = key ? components.get(key) : undefined;
      if (key && systolicCounts.get(key) === 1 && matches?.length === 1) diastolic = matches[0].value;
    }
    // Match the backend's plausible ranges, not a "normal BP" cutoff.
    if (!numericInRange(diastolic, 20, 200)) continue;
    readings.push({
      id: record.id, systolic: record.value, diastolic, unit: "mmHg",
      timestamp: at, timeKind: record.date ? "measured" : "recorded",
    });
  }
  // Preserve distinct measurements at the same time and use a stable tie-breaker.
  return readings.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id));
}
