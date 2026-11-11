/* Client mirror of api-server clinical-rule-schema.ts. The server stays authoritative; this gives early, precise feedback. */
export type Rule = Record<string, unknown>;

export const RULE_KINDS = [
  { id: "threshold", label: "Threshold", desc: "A reading crosses a value or leaves a range, optionally confirmed by repeat readings." },
  { id: "trend", label: "Trend", desc: "A statistic over a window (mean, slope, max, delta) crosses a value." },
  { id: "missing_data", label: "Missing data", desc: "No device, ePRO or adherence data for a number of days." },
  { id: "adherence", label: "Adherence", desc: "Low completion, consecutive misses or reported barriers." },
  { id: "score", label: "Score", desc: "Instrument total, band, change from prior or a single item flag." },
  { id: "time_budget", label: "Time budget", desc: "Program minutes falling short near period end." },
  { id: "device_days_at_risk", label: "Device days at risk", desc: "Counted device days unlikely to reach the target." },
] as const;
export type RuleKind = (typeof RULE_KINDS)[number]["id"];
export const kindLabel = (k: unknown) => RULE_KINDS.find((x) => x.id === k)?.label ?? String(k ?? "Unknown");

export const OPS = ["gt", "gte", "lt", "lte", "outside"] as const;
export const OP_LABEL: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", outside: "outside" };
export const ROLES = ["admin", "clinical_admin", "care_manager", "behavioral_care_manager", "psychiatric_consultant", "billing_provider", "therapist"] as const;
export const CHANNELS = ["in_app", "push", "sms", "email"] as const;
export const RESOLUTION_CODES = [
  { id: "contacted_patient", label: "Contacted patient" },
  { id: "adjusted_plan", label: "Adjusted care plan" },
  { id: "referred", label: "Referred" },
  { id: "false_positive", label: "False positive" },
  { id: "device_issue", label: "Device issue" },
  { id: "no_action_needed", label: "No action needed" },
] as const;
export const resolutionLabel = (c: unknown) => RESOLUTION_CODES.find((x) => x.id === c)?.label ?? (typeof c === "string" ? c.replace(/_/g, " ") : "");

export const LOINC: { code: string; label: string; unit: string }[] = [
  { code: "8480-6", label: "Systolic blood pressure", unit: "mmHg" },
  { code: "8462-4", label: "Diastolic blood pressure", unit: "mmHg" },
  { code: "2339-0", label: "Glucose", unit: "mg/dL" },
  { code: "29463-7", label: "Body weight", unit: "kg" },
  { code: "8867-4", label: "Heart rate", unit: "/min" },
  { code: "59408-5", label: "SpO2 (pulse oximetry)", unit: "%" },
  { code: "72514-3", label: "Pain severity 0-10", unit: "score" },
];
export const loincLabel = (c: unknown) => LOINC.find((l) => l.code === c)?.label ?? (c ? `LOINC ${String(c)}` : "reading");

const COMMON = ["kind", "version", "owner_role", "escalate_after_hours", "deduplication_window_minutes", "notify", "provisional", "sourceRef", "reviewRequired", "verified", "legacy_key"];
export const KIND_FIELDS: Record<RuleKind, string[]> = {
  threshold: ["loinc", "op", "value", "low", "high", "any_of", "confirm_with_n_readings", "within_hours"],
  trend: ["loinc", "window_days", "stat", "op", "value", "low", "high", "min_points"],
  missing_data: ["stream", "days_without", "only_if_enrolled_days_gte", "instrument_key"],
  adherence: ["item_kind", "window_days", "completion_rate_lt", "missed_consecutive_gte", "barrier_in"],
  score: ["instrument_key", "op", "value", "low", "high", "band_in", "change_from_prior_gte", "change_direction", "compare_to", "item_flag"],
  time_budget: ["program_key", "code", "days_left_lte", "minutes_short_gte", "value"],
  device_days_at_risk: ["program_key", "code", "days_left_lte", "shortfall_gte", "value"],
};
const ALL_KEYS = new Set([...COMMON, ...Object.values(KIND_FIELDS).flat()]);

const KIND_DEFAULTS: Record<RuleKind, Rule> = {
  threshold: { loinc: "8480-6", op: "gte", value: 180, confirm_with_n_readings: 1, within_hours: 24 },
  trend: { loinc: "29463-7", window_days: 7, stat: "delta", op: "gte", value: 2, min_points: 4 },
  missing_data: { stream: "device", days_without: 3, only_if_enrolled_days_gte: 3 },
  adherence: { item_kind: "medication", window_days: 7, completion_rate_lt: 0.6 },
  score: { instrument_key: "phq9", op: "gte", value: 20, compare_to: "prior", change_direction: "increase" },
  time_budget: { program_key: "CCM", code: "99490", days_left_lte: 7, minutes_short_gte: 5, value: 20 },
  device_days_at_risk: { program_key: "RPM", code: "99454", days_left_lte: 7, shortfall_gte: 2, value: 16 },
};
export function baseRule(kind: RuleKind): Rule {
  return { kind, version: "1", provisional: true, reviewRequired: true, notify: { channels: ["in_app"], quiet_period_minutes: 60, critical_bypass_quiet: true }, ...KIND_DEFAULTS[kind] };
}

/** Change kind: keep shared metadata, drop fields the new kind cannot use, fill new defaults. */
export function changeKind(rule: Rule, kind: RuleKind): { rule: Rule; dropped: string[] } {
  const keep = new Set([...COMMON, ...KIND_FIELDS[kind]]);
  const reset = new Set(["op", "value", "low", "high"]);
  const next: Rule = { ...KIND_DEFAULTS[kind] };
  for (const [k, v] of Object.entries(rule)) if (keep.has(k) && k !== "kind" && !reset.has(k) && v !== undefined) next[k] = v;
  const dropped = Object.keys(rule).filter((k) => k !== "kind" && rule[k] !== undefined && JSON.stringify(rule[k]) !== JSON.stringify(next[k]));
  return { rule: { kind, ...next, provisional: true }, dropped };
}

/** Same aliases the server normalizes. Returns canonical rule and the aliases found. */
export function canonicalize(raw: Rule): { rule: Rule; aliases: string[]; conflicts: string[] } {
  const out: Rule = { ...raw };
  const found: string[] = [];
  const conflicts: string[] = [];
  const map: Record<string, string> = { threshold: raw.kind === "missing_data" ? "days_without" : "value", windowDays: "window_days", minPoints: "min_points", days: "days_without", rate: "completion_rate_lt", escalateAfterHours: "escalate_after_hours", ownerRole: "owner_role", owner: "owner_role" };
  if (raw.kind === "adherence" && raw.threshold !== undefined) {
    delete out.threshold; found.push("threshold (ignored for adherence)");
    if (raw.rate === undefined && raw.completion_rate_lt === undefined && raw.missed_consecutive_gte === undefined && !raw.barrier_in) out.completion_rate_lt = 0.5;
  }
  for (const [old, key] of Object.entries(map)) {
    if (out[old] === undefined) continue;
    if (out[key] !== undefined && JSON.stringify(out[key]) !== JSON.stringify(out[old])) conflicts.push(`${old} conflicts with ${key}`);
    else { out[key] = out[old]; found.push(`${old} → ${key}`); }
    delete out[old];
  }
  if (out.kind === "time_budget" && out.value === undefined) out.value = 20;
  if (out.kind === "device_days_at_risk" && out.value === undefined) out.value = 16;
  if (out.version !== undefined && typeof out.version === "number") out.version = String(out.version);
  return { rule: out, aliases: found, conflicts };
}

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
export function validateRule(r: Rule): string[] {
  const e: string[] = [];
  const add = (path: string, msg: string) => e.push(`${path}: ${msg}`);
  const kind = r.kind as RuleKind;
  if (!RULE_KINDS.some((k) => k.id === kind)) { add("kind", "choose one of the seven rule kinds"); return e; }
  // Stored migrated definitions carry defaults for every kind; any schema key is accepted, only truly unknown keys are rejected.
  for (const k of Object.keys(r)) if (!ALL_KEYS.has(k)) add(k, "unknown field (the server rejects unrecognized keys)");
  if (r.provisional !== undefined && r.provisional !== true) add("provisional", "must stay true");
  if (r.legacy_key !== undefined && r.legacy_key !== "bp_critical") add("legacy_key", "only \"bp_critical\" is supported");
  if (r.verified !== undefined && typeof r.verified !== "boolean") add("verified", "must be true or false");
  if (r.reviewRequired !== undefined && typeof r.reviewRequired !== "boolean") add("reviewRequired", "must be true or false");
  const range = (k: string, min: number, max: number, int = false, exclMin = false) => {
    if (r[k] === undefined) return;
    const v = r[k];
    if (!num(v)) { add(k, "must be a number"); return; }
    const n = v as number;
    if (int && !Number.isInteger(n)) add(k, "must be a whole number");
    if (exclMin ? n <= min : n < min) add(k, `must be ${exclMin ? "greater than" : "at least"} ${min}`);
    if (n > max) add(k, `must be at most ${max}`);
  };
  range("confirm_with_n_readings", 1, 20, true); range("within_hours", 0, 2160, false, true);
  range("window_days", 1, 365, true); range("min_points", 1, 1000, true);
  range("days_without", 0, 365, false, true); range("only_if_enrolled_days_gte", 0, 365);
  range("completion_rate_lt", 0, 1); range("missed_consecutive_gte", 1, 365, true);
  range("change_from_prior_gte", 0, 10000, false, true);
  range("days_left_lte", 0, 365, true); range("shortfall_gte", 0, 366); range("minutes_short_gte", 0, 10000);
  range("escalate_after_hours", 0, 8760, false, true); range("deduplication_window_minutes", 1, 525600, true);
  for (const k of ["value", "low", "high"]) if (r[k] !== undefined && !num(r[k])) add(k, "must be a number");
  if (r.op !== undefined && !OPS.includes(r.op as never)) add("op", "use gt, gte, lt, lte or outside");
  if (r.owner_role !== undefined && !ROLES.includes(r.owner_role as never)) add("owner_role", "unknown role");
  if (r.code !== undefined && !/^[A-Z0-9]{5}$/.test(String(r.code))) add("code", "five uppercase letters or digits");
  if (r.program_key !== undefined && !["RPM", "RTM", "CCM", "PCM", "BHI"].includes(String(r.program_key))) add("program_key", "RPM, RTM, CCM, PCM or BHI");
  const cmp = (c: Rule, path: string) => {
    const op = (c.op as string) ?? "gte";
    if (op === "outside") { if (!num(c.low) || !num(c.high) || (c.low as number) >= (c.high as number)) add(path, "outside comparisons require low < high"); }
    else if (!num(c.value)) add(path, "a numeric comparison value is required");
  };
  if (kind === "threshold" || kind === "trend") {
    if (kind === "threshold" && r.any_of !== undefined) {
      if (!Array.isArray(r.any_of) || !r.any_of.length || r.any_of.length > 10) add("any_of", "1 to 10 conditions");
      else r.any_of.forEach((c, i) => {
        const o = (c && typeof c === "object" ? c : {}) as Rule;
        if (!o.loinc) add(`any_of.${i}.loinc`, "required");
        for (const k of Object.keys(o)) if (!["loinc", "op", "value", "low", "high"].includes(k)) add(`any_of.${i}.${k}`, "unknown field");
        if (!o.op) add(`any_of.${i}.op`, "required");
        cmp(o, `any_of.${i}`);
      });
    } else { if (!r.loinc) add("loinc", "required"); cmp(r, "value"); }
  }
  if (kind === "trend" && r.stat !== undefined && !["mean", "slope", "max", "delta"].includes(String(r.stat))) add("stat", "mean, slope, max or delta");
  if (kind === "missing_data" && r.stream !== undefined && !["device", "epro", "adherence"].includes(String(r.stream))) add("stream", "device, epro or adherence");
  if (kind === "adherence" && r.completion_rate_lt === undefined && !r.missed_consecutive_gte && !(Array.isArray(r.barrier_in) && r.barrier_in.length)) add("completion_rate_lt", "choose a completion rate, consecutive misses or barrier condition");
  if (kind === "score") {
    if (!r.instrument_key) add("instrument_key", "required for score rules");
    if (r.band_in !== undefined && (!Array.isArray(r.band_in) || !r.band_in.length)) add("band_in", "list at least one band");
    if (r.item_flag !== undefined) {
      const f = (r.item_flag ?? {}) as Rule;
      if (!num(f.index) || !Number.isInteger(f.index) || (f.index as number) < 1 || (f.index as number) > 100) add("item_flag.index", "whole number 1 to 100 (1-based)");
      if (!num(f.value)) add("item_flag.value", "required");
    }
    if (!r.band_in && !r.item_flag && r.change_from_prior_gte === undefined) cmp(r, "value");
  }
  const n = (r.notify ?? {}) as Rule;
  if (r.notify !== undefined) {
    for (const k of Object.keys(n)) if (!["channels", "quiet_period_minutes", "on_call_role", "critical_bypass_quiet"].includes(k)) add(`notify.${k}`, "unknown field");
    if (n.channels !== undefined && (!Array.isArray(n.channels) || n.channels.some((c) => !CHANNELS.includes(c as never)))) add("notify.channels", "in_app, push, sms or email");
    if (n.on_call_role !== undefined && !ROLES.includes(n.on_call_role as never)) add("notify.on_call_role", "unknown role");
  }
  return e;
}

/** Plain-language one-liner using real metric names. */
export function describeRule(r: Rule): string {
  const c = (o: Rule) => (o.op === "outside" ? `outside ${o.low}–${o.high}` : `${OP_LABEL[String(o.op ?? "gte")] ?? o.op} ${o.value ?? "?"}`);
  switch (r.kind) {
    case "threshold":
      return Array.isArray(r.any_of)
        ? `Any of: ${(r.any_of as Rule[]).map((o) => `${loincLabel(o.loinc)} ${c(o)}`).join(" or ")}${Number(r.confirm_with_n_readings ?? 1) > 1 ? `, confirmed by ${r.confirm_with_n_readings} readings within ${r.within_hours ?? 24} h` : ""}`
        : `${loincLabel(r.loinc)} ${c(r)}${Number(r.confirm_with_n_readings ?? 1) > 1 ? `, ${r.confirm_with_n_readings} readings within ${r.within_hours ?? 24} h` : ""}`;
    case "trend": return `${String(r.stat ?? "mean")} of ${loincLabel(r.loinc)} over ${r.window_days ?? 7} d ${c(r)} (min ${r.min_points ?? 4} points)`;
    case "missing_data": return `No ${r.stream ?? "device"} data for ${r.days_without ?? 3} d${r.instrument_key ? ` (${r.instrument_key})` : ""}`;
    case "adherence": return [r.completion_rate_lt !== undefined && `${r.item_kind ?? "any"} completion < ${Math.round(Number(r.completion_rate_lt) * 100)}% over ${r.window_days ?? 7} d`, r.missed_consecutive_gte && `${r.missed_consecutive_gte}+ consecutive misses`, Array.isArray(r.barrier_in) && r.barrier_in.length && `barrier in ${(r.barrier_in as string[]).join(", ")}`].filter(Boolean).join("; ");
    case "score": {
      const f = r.item_flag as Rule | undefined;
      if (f) return `${r.instrument_key} item ${f.index} ${OP_LABEL[String(f.op ?? "gt")]} ${f.value}`;
      if (Array.isArray(r.band_in)) return `${r.instrument_key} band in ${(r.band_in as string[]).join(", ")}`;
      if (r.change_from_prior_gte !== undefined) return `${r.instrument_key} ${r.change_direction ?? "increase"} ≥ ${r.change_from_prior_gte} vs ${r.compare_to ?? "prior"}`;
      return `${r.instrument_key} total ${c(r)}`;
    }
    case "time_budget": return `${r.program_key ?? "Program"} ${r.code ?? ""} ≥ ${r.minutes_short_gte ?? 1} min short of ${r.value ?? 20} with ≤ ${r.days_left_lte ?? 7} d left`;
    case "device_days_at_risk": return `${r.program_key ?? "RPM"} ${r.code ?? ""} ≥ ${r.shortfall_gte ?? 1} days short of ${r.value ?? 16} with ≤ ${r.days_left_lte ?? 7} d left`;
    default: return "Unrecognized rule kind";
  }
}

export type Preset = { id: string; title: string; program: string; severity: string; description: string; rule: Rule };
const src = "Provisional demo example. Verify against practice protocol before enabling.";
export const PRESETS: Preset[] = [
  { id: "htn", title: "Severe hypertension reading", program: "RPM", severity: "critical", description: "Systolic ≥ 180 or diastolic ≥ 120.", rule: { ...baseRule("threshold"), loinc: undefined, value: undefined, op: undefined, any_of: [{ loinc: "8480-6", op: "gte", value: 180 }, { loinc: "8462-4", op: "gte", value: 120 }], sourceRef: src } },
  { id: "glucose", title: "Glucose outside 70–300", program: "RPM", severity: "high", description: "Glucose below 70 or above 300 mg/dL.", rule: { ...baseRule("threshold"), loinc: "2339-0", op: "outside", value: undefined, low: 70, high: 300, sourceRef: src } },
  { id: "pain", title: "RTM pain ≥ 8", program: "RTM", severity: "high", description: "Patient-reported pain severity 8 or higher.", rule: { ...baseRule("threshold"), loinc: "72514-3", op: "gte", value: 8, sourceRef: src } },
  { id: "phq9", title: "PHQ-9 item 9 positive", program: "BHI", severity: "critical", description: "Any non-zero response to PHQ-9 item 9. Needs same-day clinician review.", rule: { ...baseRule("score"), instrument_key: "phq9", op: undefined, value: undefined, item_flag: { index: 9, op: "gt", value: 0 }, owner_role: "behavioral_care_manager", sourceRef: src } },
];
export const clean = (r: Rule): Rule => JSON.parse(JSON.stringify(r));
