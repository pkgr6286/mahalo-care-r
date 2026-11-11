import { useMemo } from "react";
import { FlaskConical, History } from "lucide-react";
import { Activity, Database, FileWarning, Fingerprint, HeartPulse, Pill as PillIcon, RefreshCw, Stethoscope } from "lucide-react";
import type { CareRecord, Patient } from "@workspace/api-client-react";
import { ConfirmButton, EmptyState, Panel, Pill } from "@/components/kit";
import { ReadOnlyHint, usePermission } from "@/components/access";
import { EhrMatchPanel } from "@/components/ehr-match";
import { fmtDate, fmtDateTime, fmtRel, mArr, mStr, useAction } from "@/lib/api";

type Res = Record<string, unknown> & { resourceType?: string };
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const codeText = (v: unknown) => { const o = obj(v); return str(o.text) || str(obj((o.coding as unknown[] | undefined)?.[0]).display); };
const statusText = (v: unknown) => (typeof v === "string" ? v : codeText(v) || str(obj((obj(v).coding as unknown[] | undefined)?.[0]).code));

function isEhr(r: CareRecord) {
  const m = r.metadata ?? {};
  return r.kind === "interactions" && (m.source === "fhir_fixture" || m.kind === "ehr_sync" || m.kind === "ehr_match_pending");
}
const isPending = (r: CareRecord) => r.metadata?.kind === "ehr_match_pending" || r.status === "confirmation_required" || r.status === "match_blocked";
const seq = (r: CareRecord) => { const n = Number(r.metadata?.cacheSequence); return Number.isFinite(n) ? n : -1; };
/** Newest first: cacheSequence, then creation time. */
const byLatest = (a: CareRecord, b: CareRecord) => seq(b) - seq(a) || b.createdAt.localeCompare(a.createdAt);

export function EhrTab({ p, interactions }: { p: Patient; interactions: CareRecord[] }) {
  const { run, pending: pending_ } = useAction();
  const canWrite = usePermission().allow("clinical.write");
  const ordered = useMemo(() => [...interactions].filter(isEhr).sort(byLatest), [interactions]);
  const head = ordered[0];
  const pending = head && isPending(head) ? head : undefined;
  const latest = ordered.find((r) => !isPending(r));
  const historical = !!pending && !!latest;
  const resources = useMemo<Res[] | null>(() => { const r = latest?.metadata?.resources; return Array.isArray(r) ? (r.filter((x) => x && typeof x === "object") as Res[]) : null; }, [latest]);

  const refresh = !canWrite ? <ReadOnlyHint text="Refresh needs clinical write access" /> : (
    <span className="flex flex-wrap gap-1.5">
    <ConfirmButton size="md" variant="ghost" label="Demo identity mismatch" icon={<FlaskConical className="h-4 w-4" strokeWidth={1.6} />} title="Create a demo identity mismatch" desc="Produces a synthetic fixture candidate whose MRN does not match, so you can practise manual identity confirmation. Demo only; no clinical data is linked until confirmed." confirmLabel="Create demo case" pending={pending_} onConfirm={(_, c) => run({ action: "syncEhr", patientId: p.id, payload: { demonstrateManualMatch: true } }, c)} testid="button-ehr-demo-mismatch" />
    <ConfirmButton size="md" label={latest ? "Refresh from fixture" : "Load fixture context"} icon={<RefreshCw className="h-4 w-4" />} title="Refresh EHR context (fixture)" desc="Reads this patient's synthetic FHIR fixture, matched by MRN, and caches a read-only copy. No live EHR is contacted and nothing is written back." confirmLabel="Refresh" pending={pending_} onConfirm={(_, c) => run({ action: "syncEhr", patientId: p.id, payload: {} }, c)} testid="button-ehr-refresh" />
    </span>
  );
  const labels = (
    <div className="flex flex-wrap gap-1.5" data-testid="labels-ehr">
      <Pill tone="teal">FHIR fixture</Pill><Pill tone="teal">Synthetic</Pill><Pill tone="neutral">No live EHR</Pill><Pill tone="neutral">No writeback</Pill><Pill tone="neutral">Read only</Pill>
    </div>
  );

  const matchPanel = pending ? <EhrMatchPanel key={pending.id + mStr(pending, "matchHash")} p={p} rec={pending} canWrite={canWrite} /> : null;
  if (!latest) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">{labels}{refresh}</div>
        {matchPanel ?? <EmptyState icon={<Database className="h-4 w-4" strokeWidth={1.6} />} title="No EHR context cached" desc="Load the synthetic FHIR fixture to see matched conditions, medications and recent vitals. This demo has no production EHR connection." />}
      </div>
    );
  }

  const lastSync = mStr(latest, "lastSync") || latest.createdAt;
  const by = (t: string) => (resources ?? []).filter((r) => r.resourceType === t);
  const ehrPt = by("Patient")[0];
  const name = obj((ehrPt?.name as unknown[] | undefined)?.[0]);
  const ehrName = str(name.text) || [...((name.given as unknown[]) ?? []).map(str), str(name.family)].filter(Boolean).join(" ");
  const conditions = by("Condition");
  const meds = by("MedicationRequest");
  const vitals = by("Observation").sort((a, b) => str(b.effectiveDateTime).localeCompare(str(a.effectiveDateTime))).slice(0, 20);

  return (
    <div className="space-y-4" data-testid="panel-ehr">
      <div className="flex flex-wrap items-center justify-between gap-3">{labels}{refresh}</div>
      {matchPanel}
      {historical && <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="banner-ehr-historical"><History className="h-3.5 w-3.5" strokeWidth={1.6} />Earlier fixture cache, shown for reference. It is not the current identity state above.</div>}
      <div className={"grid gap-3" + (historical ? " opacity-75" : "") + " rounded-xl border border-card-border bg-card p-4 text-sm sm:grid-cols-4"} data-testid="ehr-identity">
        <Meta icon={<Fingerprint className="h-3.5 w-3.5" strokeWidth={1.6} />} l="Matched by" v={mStr(latest, "matchedBy") === "confirmed_name_dob" ? "Clinician-confirmed name and DOB" : (mStr(latest, "matchedBy") || "mrn").toUpperCase() + " " + p.mrn} />
        <Meta icon={<Database className="h-3.5 w-3.5" strokeWidth={1.6} />} l="EHR patient ref" v={mStr(latest, "ehrPatientId") || str(ehrPt?.id) || "Not provided"} mono />
        <Meta icon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.6} />} l="Fixture read" v={fmtRel(lastSync)} title={fmtDateTime(lastSync)} />
        <Meta icon={<Stethoscope className="h-3.5 w-3.5" strokeWidth={1.6} />} l="Fixture identity" v={ehrPt ? `${ehrName || "Unnamed"}${ehrPt.birthDate ? " · " + fmtDate(str(ehrPt.birthDate)) : ""}` : "Not in fixture"} />
      </div>

      {resources === null ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-[hsl(38_80%_70%)] bg-[hsl(38_95%_96%)] p-4 text-sm text-[hsl(30_80%_28%)]" data-testid="state-ehr-needs-refresh">
          <span className="flex items-center gap-2 font-medium"><FileWarning className="h-4 w-4" strokeWidth={1.6} />Older cached format. Refresh needed.</span>
          <span className="text-xs">This snapshot predates structured FHIR resources. Refresh to load identity, vitals and statuses.{(mArr(latest, "conditions").length || mArr(latest, "medications").length) ? " Previously cached lists:" : ""}</span>
          {mArr(latest, "conditions").length > 0 && <span className="text-xs">Conditions: {mArr(latest, "conditions").join(", ")}</span>}
          {mArr(latest, "medications").length > 0 && <span className="text-xs">Medications: {mArr(latest, "medications").join(", ")}</span>}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={<span className="inline-flex items-center gap-2"><HeartPulse className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Conditions</span>} sub={`${conditions.length} in fixture`} bodyClass="p-0">
            {!conditions.length ? <p className="p-4 text-xs text-muted-foreground">None in fixture.</p> : <ul>{conditions.map((c, i) => <Row key={i} t={codeText(c.code) || "Unnamed condition"} s={statusText(c.clinicalStatus)} testid={`row-ehr-condition-${i}`} />)}</ul>}
          </Panel>
          <Panel title={<span className="inline-flex items-center gap-2"><PillIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Medication requests</span>} sub={`${meds.length} in fixture`} bodyClass="p-0">
            {!meds.length ? <p className="p-4 text-xs text-muted-foreground">None in fixture.</p> : <ul>{meds.map((m, i) => <Row key={i} t={codeText(m.medicationCodeableConcept) || "Unnamed medication"} s={str(m.status)} testid={`row-ehr-med-${i}`} />)}</ul>}
          </Panel>
          <Panel className="lg:col-span-2" title={<span className="inline-flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Recent vitals</span>} sub="As recorded in the fixture, newest first" bodyClass="p-0">
            {!vitals.length ? <p className="p-4 text-xs text-muted-foreground">No observations in fixture.</p> : (
              <table className="w-full text-sm">
                <caption className="sr-only">Recent vitals from the EHR fixture</caption>
                <thead><tr className="border-b border-border bg-secondary/40 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><th scope="col" className="px-4 py-2 font-semibold">Measure</th><th scope="col" className="px-2 py-2 font-semibold">Value</th><th scope="col" className="px-4 py-2 font-semibold">Recorded</th></tr></thead>
                <tbody>{vitals.map((o, i) => { const q = obj(o.valueQuantity); return (
                  <tr key={i} className="border-b border-border last:border-b-0" data-testid={`row-ehr-vital-${i}`}>
                    <td className="px-4 py-2">{codeText(o.code) || "Observation"}</td>
                    <td className="tnum px-2 py-2 font-medium">{str(q.value) || "—"} <span className="text-xs font-normal text-muted-foreground">{str(q.unit)}</span></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{o.effectiveDateTime ? fmtDateTime(str(o.effectiveDateTime)) : "No time"}</td>
                  </tr>); })}</tbody>
              </table>
            )}
          </Panel>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Cached read-only context from a synthetic FHIR R4 fixture adapter. Not a production vendor connection; edits in Mahalo Care are never written back.</p>
    </div>
  );
}

function Meta({ icon, l, v, mono, title }: { icon: React.ReactNode; l: string; v: string; mono?: boolean; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{icon}{l}</div>
      <div className={"mt-0.5 truncate " + (mono ? "font-mono text-xs" : "")}>{v}</div>
    </div>
  );
}
function Row({ t, s, testid }: { t: string; s: string; testid: string }) {
  return <li className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm last:border-b-0" data-testid={testid}><span className="min-w-0 flex-1 truncate">{t}</span>{s && <Pill tone="neutral">{s}</Pill>}</li>;
}
