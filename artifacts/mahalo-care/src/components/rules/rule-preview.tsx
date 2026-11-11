import { useState } from "react";
import { CheckCircle2, CircleDashed, FlaskConical } from "lucide-react";
import { useListPatients, getListPatientsQueryKey, type ActionResult } from "@workspace/api-client-react";
import { Btn, Field, Pill, inputCls } from "@/components/kit";
import { fmtDateTime, useAction } from "@/lib/api";

const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const txt = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Runs the saved rule against one patient's stored history via testRule. No exceptions are created. */
export function RulePreview({ ruleId, dirty }: { ruleId: string; dirty?: boolean }) {
  const [pid, setPid] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const patients = useListPatients(undefined, { query: { queryKey: getListPatientsQueryKey() } });
  const { run, pending } = useAction();
  const recs = result?.records ?? (result?.record ? [result.record] : []);
  return (
    <div className="space-y-3" data-testid="rule-preview">
      {dirty && <p className="rounded-lg border border-dashed border-[hsl(38_80%_70%)] bg-[hsl(38_95%_96%)] px-3 py-2 text-[11px] text-[hsl(30_80%_28%)]">Preview runs the saved version. Save your changes first to preview them.</p>}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Patient" className="min-w-[220px] flex-1">
          <select className={inputCls} value={pid} onChange={(e) => { setPid(e.target.value); setResult(null); }} data-testid="select-rule-patient" disabled={patients.isLoading}>
            <option value="">{patients.isLoading ? "Loading patients…" : patients.isError ? "Patients unavailable" : "Select patient"}</option>
            {(patients.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.lastName}, {p.firstName} · {p.mrn}</option>)}
          </select>
        </Field>
        <Btn variant="primary" disabled={!pid || pending} onClick={() => run({ action: "testRule", id: ruleId, patientId: pid }, setResult, { always: true })} data-testid="button-run-rule-preview"><FlaskConical className="h-4 w-4" />{pending ? "Running…" : "Run preview"}</Btn>
      </div>
      {result && (
        <div className="space-y-2" aria-live="polite" data-testid="text-rule-result">
          {!recs.length && <p className="text-xs text-muted-foreground">{result.message || "The rule returned no evaluation for this patient (for example, the patient is inactive or has no relevant data)."}</p>}
          {recs.map((r) => {
            const m = (r.metadata ?? {}) as Record<string, unknown>;
            const matched = m.matched === true || r.status === "matched";
            const ids = arr(m.sourceIds);
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {matched ? <CheckCircle2 className="h-4 w-4 text-destructive" strokeWidth={1.6} /> : <CircleDashed className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />}
                  <span className="font-medium">{matched ? "Would match" : "Would not match"}</span>
                  <Pill tone="neutral">Preview only</Pill>
                  <span className="ml-auto text-[11px] text-muted-foreground">{fmtDateTime(r.createdAt)}</span>
                </div>
                <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Metric</dt><dd className="font-medium">{txt(m.metric) || "Not reported"}</dd></div>
                  <div><dt className="text-muted-foreground">Observed</dt><dd className="tnum font-medium">{txt(m.observed) || (r.value !== undefined ? String(r.value) : "Not reported")}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted-foreground">Explanation</dt><dd>{txt(m.explanation) || r.description || "None"}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted-foreground">Source records ({ids.length})</dt><dd className="break-all font-mono text-[11px]">{ids.length ? ids.join(", ") : "None"}</dd></div>
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
