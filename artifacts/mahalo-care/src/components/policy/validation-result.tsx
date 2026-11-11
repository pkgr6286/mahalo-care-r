import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { ProgramPolicyValidation } from "@workspace/api-client-react";
import { Pill } from "@/components/kit";

export function ErrorList({ errors, title = "Not accepted" }: { errors: string[]; title?: string }) {
  if (!errors.length) return null;
  return (
    <div role="alert" className="rounded-xl border border-destructive/25 bg-[hsl(352_80%_98.5%)] p-3 text-xs text-destructive" data-testid="policy-errors">
      <div className="flex items-center gap-1.5 font-medium"><XCircle className="h-3.5 w-3.5" strokeWidth={1.6} />{title}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 font-mono text-[11px]">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
    </div>
  );
}

export function ValidationResult({ v }: { v: ProgramPolicyValidation }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-3" data-testid="policy-validation">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {v.valid ? <CheckCircle2 className="h-4 w-4 text-[hsl(152_45%_35%)]" strokeWidth={1.6} /> : <XCircle className="h-4 w-4 text-destructive" strokeWidth={1.6} />}
        {v.valid ? "Body passes the policy grammar" : "Body does not pass the policy grammar"}
        <Pill tone="amber">Synthetic evidence</Pill>
      </div>
      {v.warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-[hsl(30_80%_28%)]">{v.warnings.map((w, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />{w}</li>)}</ul>
      )}
      {v.evidence.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[520px] text-xs">
            <caption className="sr-only">Synthetic evidence preview per CPT code</caption>
            <thead><tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><th scope="col" className="px-3 py-2">CPT</th><th scope="col" className="px-2 py-2">Result</th><th scope="col" className="px-2 py-2">Units</th><th scope="col" className="px-2 py-2">Minutes</th><th scope="col" className="px-2 py-2">Device days</th><th scope="col" className="px-3 py-2">Blockers</th></tr></thead>
            <tbody>{v.evidence.map((e, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                <td className="px-3 py-1.5 font-mono">{e.cpt}</td>
                <td className="px-2 py-1.5"><Pill tone={e.met ? "green" : "neutral"}>{e.met ? "Met" : "Not met"}</Pill></td>
                <td className="tnum px-2 py-1.5">{e.units}</td><td className="tnum px-2 py-1.5">{e.minutes}</td><td className="tnum px-2 py-1.5">{e.deviceDays}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{e.blockers.length ? e.blockers.join("; ") : "None"}</td>
              </tr>))}</tbody>
          </table>
        </div>
      ) : <p className="text-xs text-muted-foreground">No evidence preview for this kind.</p>}
      <p className="text-[11px] text-muted-foreground">Evidence is computed against a synthetic patient month. It is a sanity check, not a billing determination.</p>
    </div>
  );
}
