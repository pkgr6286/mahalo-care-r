import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Fingerprint, ShieldX, UserCheck } from "lucide-react";
import { usePerformAction, type CareRecord, type Patient } from "@workspace/api-client-react";
import { Btn, Field, Pill, inputCls } from "@/components/kit";
import { errMsg, fmtDateTime, mBool, mStr } from "@/lib/api";
import { cn } from "@/lib/utils";

type Identity = { id: string; mrn: string; firstName: string; lastName: string; dob: string };
const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
function identityOf(r: CareRecord, key: string): Identity | null {
  const v = r.metadata?.[key];
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return { id: s(o.id), mrn: s(o.mrn), firstName: s(o.firstName), lastName: s(o.lastName), dob: s(o.dob) };
}
const norm = (v: string) => v.trim().toLowerCase();
const dobKey = (v: string) => v.trim().slice(0, 10);
const isStatus = (e: unknown, n: number) => !!e && typeof e === "object" && "status" in e && (e as { status: number }).status === n;

export function EhrMatchPanel({ p, rec, canWrite }: { p: Patient; rec: CareRecord; canWrite: boolean }) {
  const qc = useQueryClient();
  const m = usePerformAction();
  const [attest, setAttest] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<{ stale: boolean; msg: string } | null>(null);
  const local = identityOf(rec, "localIdentity");
  const cand = identityOf(rec, "candidateIdentity");
  const hash = mStr(rec, "matchHash");
  const blocked = rec.status === "match_blocked";
  const dobDiffers = !local || !cand || !local.dob || !cand.dob || dobKey(local.dob) !== dobKey(cand.dob);
  const demo = mBool(rec, "demonstrateManualMatch") || mBool(rec, "demo") || /demo/i.test(rec.title);
  const canConfirm = canWrite && !blocked && !dobDiffers && !!cand?.id && !!hash;
  const reasonOk = reason.trim().length >= 20 && reason.trim().length <= 2000;

  const rows: { l: string; a: string; b: string; key?: boolean }[] = [
    { l: "Last name", a: local?.lastName ?? "", b: cand?.lastName ?? "" },
    { l: "First name", a: local?.firstName ?? "", b: cand?.firstName ?? "" },
    { l: "Date of birth", a: local?.dob ?? "", b: cand?.dob ?? "", key: true },
    { l: "MRN", a: local?.mrn ?? "", b: cand?.mrn ?? "" },
    { l: "Record ID", a: local?.id ?? "", b: cand?.id ?? "" },
  ];

  const confirm = () => {
    if (!canConfirm || !attest || !reasonOk || m.isPending || !cand) return;
    setError(null);
    m.mutate({ data: { action: "syncEhr", patientId: p.id, payload: { confirmation: { confirmed: true, candidateId: cand.id, matchHash: hash, reason: reason.trim() } } } }, {
      onSuccess: (r) => { qc.invalidateQueries(); if (!r.success) setError({ stale: false, msg: r.message || "Not linked" }); },
      onError: (e) => {
        const stale = isStatus(e, 409);
        setError({ stale, msg: stale ? "The fixture identity changed after this comparison was shown, so nothing was linked. The latest identity is loading below; compare it again before confirming." : errMsg(e) });
        if (stale) { setAttest(false); qc.invalidateQueries(); }
      },
    });
  };

  return (
    <section className="rise overflow-hidden rounded-2xl border border-[hsl(38_80%_78%)] bg-card shadow-[var(--shadow-sm)]" data-testid="panel-ehr-match">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-[hsl(38_95%_96%)] px-5 py-3">
        {blocked ? <ShieldX className="h-4 w-4 text-destructive" strokeWidth={1.6} /> : <Fingerprint className="h-4 w-4 text-[hsl(30_80%_34%)]" strokeWidth={1.6} />}
        <h2 className="text-[16px] leading-tight">{blocked ? "Fixture match blocked" : "Identity confirmation required"}</h2>
        <span className="ml-auto flex flex-wrap gap-1.5">{demo && <Pill tone="teal">Demo case</Pill>}<Pill tone="teal">FHIR fixture</Pill><Pill tone="neutral">No clinical data linked</Pill></span>
      </header>
      <div className="space-y-4 px-5 py-4">
        <p className="text-xs text-muted-foreground">The fixture record did not match this patient automatically. No conditions, medications or vitals are shown or linked until a clinician confirms both records describe the same person. Read {fmtDateTime(mStr(rec, "lastSync") || rec.createdAt)}.</p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Mahalo Care identity compared with fixture candidate</caption>
            <thead><tr className="border-b border-border bg-secondary/40 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><th scope="col" className="px-4 py-2">Field</th><th scope="col" className="px-3 py-2">Mahalo Care</th><th scope="col" className="px-3 py-2">Fixture candidate</th><th scope="col" className="px-3 py-2"><span className="sr-only">Comparison</span></th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const same = r.key ? !!r.a && dobKey(r.a) === dobKey(r.b) : !!r.a && norm(r.a) === norm(r.b);
                return (
                  <tr key={r.l} className={cn("border-b border-border last:border-b-0", !same && "bg-[hsl(38_95%_97%)]")}>
                    <th scope="row" className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{r.l}</th>
                    <td className="px-3 py-2 font-mono text-xs">{r.a || "Not provided"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.b || "Not provided"}</td>
                    <td className="px-3 py-2 text-right">{same ? <Pill tone="green">Same</Pill> : <Pill tone={r.key ? "red" : "amber"}>Differs</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && <div role="alert" className="flex gap-2 rounded-lg border border-destructive/25 bg-[hsl(352_80%_98.5%)] px-3 py-2 text-xs text-destructive" data-testid="alert-ehr-match"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6} /><span>{error.msg}</span></div>}

        {blocked ? (
          <p className="text-sm text-destructive">This candidate cannot be linked. Correct the patient's demographics or the source record, then refresh.</p>
        ) : dobDiffers ? (
          <p className="text-sm text-destructive" data-testid="text-ehr-dob-block">Dates of birth differ or are missing, so this match cannot be confirmed. Correct the source data and refresh.</p>
        ) : !canWrite ? (
          <p className="text-xs text-muted-foreground">A clinician with write access must confirm this match.</p>
        ) : (
          <div className="space-y-3 border-t border-border pt-3">
            <Field label="Why these records are the same person" hint={reason.trim().length + " / 20 characters minimum. Recorded with your account."}>
              <textarea className={cn(inputCls, "h-20 resize-y py-2")} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="How you verified identity, e.g. checked with the patient or the registration source" data-testid="input-ehr-match-reason" />
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={attest} onChange={(e) => setAttest(e.target.checked)} data-testid="check-ehr-same-person" />
              <span>I compared these identities and confirm the fixture candidate is the same person as {[p.firstName, p.lastName].filter(Boolean).join(" ") || "this patient"}. Linking is read-only; nothing is written back.</span>
            </label>
            <Btn variant="primary" disabled={!attest || !reasonOk || m.isPending} onClick={confirm} data-testid="button-ehr-confirm-match"><UserCheck className="h-4 w-4" strokeWidth={1.6} />{m.isPending ? "Linking…" : "Confirm and link fixture"}</Btn>
          </div>
        )}
      </div>
    </section>
  );
}
