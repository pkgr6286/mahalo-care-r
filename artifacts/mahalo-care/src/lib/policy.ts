import type { ProgramPolicy, ProgramPolicyInput, ProgramPolicyInputKind, ProgramPolicyInputProgram } from "@workspace/api-client-react";
import { errMsg } from "@/lib/api";

export type PolicyKind = ProgramPolicyInputKind;
export type PolicyProgram = ProgramPolicyInputProgram;
export type Body = Record<string, unknown>;

export const POLICY_KINDS: { id: PolicyKind; label: string; short: string; desc: string }[] = [
  { id: "rulepack", label: "Rulepacks", short: "Rulepack", desc: "CPT thresholds, eligibility and counted sources for a program." },
  { id: "payer_override", label: "Payer overrides", short: "Payer override", desc: "Tightens a published or bundled rulepack for one payer. Cannot add codes or lower thresholds." },
  { id: "careplan_template", label: "Care plan templates", short: "Care plan template", desc: "Starting goals, interventions and review cadence offered at enrollment." },
  { id: "note_template", label: "Note templates", short: "Note template", desc: "Section structure offered when writing a care note." },
];
export const kindLabel = (k: string) => POLICY_KINDS.find((x) => x.id === k)?.short ?? k;

export const isEditable = (p: ProgramPolicy) => p.status === "draft" && !p.immutable;

export function today() {
  return new Date().toISOString().slice(0, 10);
}
export function suggestVersion(base?: string) {
  const y = new Date().getFullYear();
  if (!base) return `${y}.1-draft`;
  const m = base.match(/^(.*?)(\d+)([^\d]*)$/);
  return m ? `${m[1]}${Number(m[2]) + 1}${m[3].replace(/-demo$/, "")}` : `${base}-2`;
}

export function starterBody(kind: PolicyKind, program: PolicyProgram, version: string, effectiveFrom: string, basePolicyId = ""): Body {
  const k = program.toLowerCase();
  if (kind === "careplan_template")
    return {
      key: `${k}_default`,
      description: `Provisional ${program} care plan starting point for clinician review.`,
      sections: {
        goals: ["Patient-stated goal agreed at enrollment"],
        interventions: ["Monthly care manager check-in", "Medication reconciliation"],
        careTeam: "Care manager with supervising practitioner",
        expectedOutcome: "Patient reports improved self-management confidence at the next review.",
        reviewDays: 90,
      },
      items: [],
    };
  if (kind === "note_template")
    return {
      key: `${k}_followup`,
      title: "Care follow-up",
      sections: [
        { key: "subjective", label: "Patient report", required: true },
        { key: "assessment", label: "Assessment", required: true },
        { key: "plan", label: "Plan", required: true },
      ],
    };
  if (kind === "payer_override") return { basePolicyId, codes: [{ cpt: "99457", minutes_min: 30 }] };
  return {
    key: program,
    version,
    effective_from: effectiveFrom,
    provisional: true,
    eligibility: { min_chronic_conditions: 0, condition_min_duration_months: null, initiating_visit_required_within_months: null, required_consents: ["program"], device_requirement: "none" },
    data_counted: ["clinician"],
    time_rules: {
      counts_for_management: { clinical_staff_general_supervision: ["rn", "ma"], practitioner_only: [] },
      activities: ["review_data", "phone_call", "care_coordination", "documentation"],
      rounding: "none",
      exclusive_with_programs: [],
    },
    codes: [{ cpt: "99457", kind: "management", period: "calendar_month", max_units: 1, requires: { minutes_min: 20, live_interactive_min: 1 } }],
    concurrency: [],
    careplan_template_key: `${k}_default`,
    required_instruments: [],
  };
}

/** Keep rulepack identity fields in step with the version metadata. */
export function syncBody(kind: PolicyKind, program: PolicyProgram, version: string, effectiveFrom: string, body: Body): Body {
  if (kind !== "rulepack") return body;
  return { ...body, key: program, version, effective_from: effectiveFrom, provisional: true };
}

export function toPolicyInput(p: ProgramPolicy): ProgramPolicyInput {
  return { kind: p.kind, program: p.program, version: p.version, effectiveFrom: p.effectiveFrom, payer: p.payer ?? "", sourceRef: p.sourceRef ?? "", body: p.body };
}

/** Pull field-level issues out of API errors when the backend sends them. */
export function policyErrors(e: unknown): string[] {
  const out: string[] = [];
  if (e && typeof e === "object" && "data" in e) {
    const d = (e as { data: unknown }).data;
    if (d && typeof d === "object") {
      const o = d as Record<string, unknown>;
      for (const k of ["issues", "errors", "details"]) {
        const arr = o[k];
        if (Array.isArray(arr))
          for (const it of arr) {
            if (typeof it === "string") out.push(it);
            else if (it && typeof it === "object") {
              const i = it as { path?: unknown; message?: unknown };
              const path = Array.isArray(i.path) ? i.path.join(".") : typeof i.path === "string" ? i.path : "";
              out.push(`${path ? path + ": " : ""}${typeof i.message === "string" ? i.message : JSON.stringify(it)}`);
            }
          }
      }
    }
  }
  return [errMsg(e), ...out.filter((x) => x !== errMsg(e))];
}
