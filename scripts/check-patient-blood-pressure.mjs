import assert from "node:assert/strict";
import test from "node:test";
import { selectPatientBloodPressure } from "../artifacts/mahalo-care/src/lib/patient-blood-pressure.ts";

const measured = "2026-11-17T10:00:00.000Z";
const created = "2026-11-17T12:00:00.000Z";
const metadata = { source: "device", deviceCleared: true, deviceId: "cuff-a", loinc: "8480-6", diastolic: 82, valid: true };
const row = (id, patch = {}) => ({
  id, kind: "observations", patientId: "patient-a", patientName: "Synthetic patient",
  program: "RPM", title: "Systolic blood pressure", status: "valid",
  value: 126, unit: "mmHg", date: measured, createdAt: created, updatedAt: created,
  metadata: { ...metadata }, ...patch,
});
const component = (id, patch = {}) => row(id, {
  title: "Diastolic blood pressure", value: 82,
  metadata: { ...metadata, loinc: "8462-4", diastolic: undefined }, ...patch,
});
const ids = (records) => selectPatientBloodPressure(records).map((r) => r.id);

test("backend paired systolic plus separate diastolic produces exactly one complete BP", () => {
  assert.deepEqual(selectPatientBloodPressure([component("dia"), row("sys")]), [{
    id: "sys", systolic: 126, diastolic: 82, unit: "mmHg",
    timestamp: measured, timeKind: "measured",
  }]);
});

test("diastolic-only and systolic-only records never display incomplete readings", () => {
  assert.deepEqual(ids([component("dia")]), []);
  assert.deepEqual(ids([row("sys", { metadata: { ...metadata, deviceId: undefined, diastolic: undefined } })]), []);
});

test("unambiguous separate components join only for the same device, patient, source, event and measured time", () => {
  const sys = row("sys", { metadata: { ...metadata, diastolic: undefined } });
  assert.deepEqual(ids([sys, component("dia")]), ["sys"]);
  for (const patch of [
    { patientId: "patient-b" }, { program: "CCM" },
    { date: "2026-11-17T09:59:59.000Z" },
    { metadata: { ...component("dia").metadata, deviceId: "cuff-b" } },
    { metadata: { ...component("dia").metadata, source: "cellular" } },
    { metadata: { ...component("dia").metadata, inboxId: "different-event" } },
  ]) assert.deepEqual(ids([sys, component("dia", patch)]), []);
});

test("identical timestamps do not collapse distinct complete readings or guess ambiguous components", () => {
  const a = row("a", { value: 130 }), b = row("b", { value: 140 });
  assert.deepEqual(ids([b, component("dia"), a]), ["a", "b"]);
  assert.deepEqual(ids([a, b, component("dia")].reverse()), ["a", "b"]);
  const missing = row("missing", { metadata: { ...metadata, diastolic: undefined } });
  assert.deepEqual(ids([missing, a, component("dia")]), ["a"]);
  assert.deepEqual(ids([missing, component("dia-1"), component("dia-2")]), []);
});

test("mixed measurement types and wrong units are excluded even with misleading metadata or titles", () => {
  const others = [
    ["weight", "29463-7", "kg"], ["glucose", "2339-0", "mg/dL"],
    ["pulse", "8867-4", "/min"], ["oxygen", "59408-5", "%"],
    ["pain", "72514-3", "/10"], ["wrong-unit", "8480-6", "kPa"],
    ["non-bp-with-bp-unit", "8867-4", "mmHg"],
  ].map(([id, loinc, unit]) => row(id, { title: "Blood pressure", unit, metadata: { ...metadata, loinc } }));
  assert.deepEqual(ids([...others, row("bp"), row("not-observation", { kind: "tasks" })]), ["bp"]);
});

test("legacy seed and simulated BP without LOINC remain supported, but unknown measurements do not", () => {
  assert.deepEqual(ids([
    row("legacy", { title: "Blood pressure", metadata: { ...metadata, loinc: undefined } }),
    row("unknown", { title: "Other measurement", metadata: { ...metadata, loinc: undefined } }),
  ]), ["legacy"]);
});

test("only connected cellular or cleared-device sources qualify", () => {
  const sources = [
    row("cellular", { metadata: { ...metadata, source: "cellular", deviceCleared: undefined } }),
    row("device"), row("manual", { metadata: { ...metadata, source: "clinician" } }),
    row("uncleared", { metadata: { ...metadata, deviceCleared: false } }),
    row("self-report", { metadata: { ...metadata, source: "patient_reported" } }),
  ];
  assert.deepEqual(ids(sources), ["cellular", "device"]);
});

test("invalid flags, non-finite numbers, missing values and out-of-range values are excluded", () => {
  const bad = [
    row("invalid", { status: "invalid" }), row("voided", { status: "voided" }),
    row("flag", { metadata: { ...metadata, valid: false } }),
    ...[undefined, null, NaN, Infinity, 0, 29, 301, "126"].map((value, i) => row(`sys-${i}`, { value })),
    ...[undefined, null, NaN, Infinity, 0, 19, 201, "82"].map((diastolic, i) => row(`dia-${i}`, { metadata: { ...metadata, diastolic } })),
  ];
  assert.deepEqual(ids(bad), []);
  assert.deepEqual(ids([row("critical", { value: 185, metadata: { ...metadata, diastolic: 122 } })]), ["critical"]);
});

test("invalid component values cannot repair a missing or explicitly invalid diastolic", () => {
  const missing = row("sys", { metadata: { ...metadata, diastolic: undefined } });
  for (const bad of [
    component("dia", { status: "invalid" }),
    component("dia", { value: NaN }),
    component("dia", { metadata: { ...component("dia").metadata, valid: false } }),
  ]) assert.deepEqual(ids([missing, bad]), []);
  assert.deepEqual(ids([row("bad", { metadata: { ...metadata, diastolic: 500 } }), component("dia")]), []);
});

test("measured times control ordering, not insertion time or timestamp string order", () => {
  const readings = selectPatientBloodPressure([
    row("old", { date: "2026-11-17T10:30:00+02:00", createdAt: "2026-11-18T00:00:00Z" }),
    row("new", { date: "2026-11-17T09:00:00Z" }),
  ]);
  assert.deepEqual(readings.map((r) => r.id), ["new", "old"]);
  assert.equal(readings[1].timestamp, "2026-11-17T10:30:00+02:00");
});

test("invalid timestamps are excluded; missing measurement time uses explicitly labelled recording time", () => {
  assert.deepEqual(ids([row("invalid-time", { date: "invalid" }), row("no-time", { date: undefined, createdAt: "invalid" })]), []);
  const [reading] = selectPatientBloodPressure([row("recorded", { date: undefined })]);
  assert.equal(reading.timestamp, created);
  assert.equal(reading.timeKind, "recorded");
  assert.deepEqual(ids([
    row("sys", { date: undefined, metadata: { ...metadata, diastolic: undefined } }),
    component("dia", { date: undefined }),
  ]), []);
});

test("component joins compare actual instants and never mutate the original records", () => {
  const input = [
    row("sys", { metadata: { ...metadata, diastolic: undefined } }),
    component("dia", { date: "2026-11-17T12:00:00+02:00" }),
  ];
  const snapshot = structuredClone(input);
  input.forEach((r) => { Object.freeze(r.metadata); Object.freeze(r); });
  Object.freeze(input);
  assert.deepEqual(ids(input), ["sys"]);
  assert.deepEqual(input, snapshot);
});
