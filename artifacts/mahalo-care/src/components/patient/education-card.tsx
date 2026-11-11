import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, CheckCircle2, ExternalLink } from "lucide-react";
import { usePerformAction, getListRecordsQueryKey, type CareRecord, type Patient } from "@workspace/api-client-react";
import { Btn } from "@/components/kit";
import { errMsg, fmtDate, mStr } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Only absolute https URLs are linked; anything else is shown as plain text or dropped. */
export function safeHttps(u: string): string | null {
  try { const x = new URL(u); return x.protocol === "https:" && !x.username && !x.password ? x.href : null; } catch { return null; }
}
export function isExerciseMaterial(e: CareRecord) {
  return mStr(e, "type") === "exercise" || /exercise/i.test(mStr(e, "category"));
}
function ackFor(records: CareRecord[], id: string) {
  return records
    .filter((r) => r.kind === "tasks" && mStr(r, "kind") === "education_acknowledgment" && mStr(r, "educationId") === id)
    .sort((a, b) => (mStr(b, "acknowledgedAt") || b.createdAt).localeCompare(mStr(a, "acknowledgedAt") || a.createdAt));
}
const isStatus = (e: unknown, s: number) => !!e && typeof e === "object" && "status" in e && (e as { status: number }).status === s;

export function EducationCard({ p, m, records, staff }: { p: Patient; m: CareRecord; records: CareRecord[]; staff: boolean }) {
  const qc = useQueryClient();
  const perform = usePerformAction();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const hash = mStr(m, "contentHash");
  const acks = ackFor(records, m.id);
  const current = acks.find((a) => mStr(a, "educationHash") === hash);
  const prior = !current ? acks[0] : undefined;
  const url = safeHttps(mStr(m, "url"));
  const body = mStr(m, "body") || mStr(m, "content") || mStr(m, "text");
  const version = mStr(m, "contentVersion") || mStr(m, "version");
  const source = mStr(m, "sourceRef");
  const approved = m.metadata?.contentApprovedForUse === true && !!source;
  const program = m.program ?? p.programs[0];

  const ack = () => {
    if (perform.isPending || !hash) return;
    setError(null);
    perform.mutate({ data: { action: "acknowledgeEducation", id: m.id, patientId: p.id, program, payload: { acknowledged: true, contentHash: hash } } }, {
      onSuccess: (r) => {
        qc.invalidateQueries();
        if (r.success) { setOpen(false); setChecked(false); setChanged(false); } else setError(r.message || "Not recorded");
      },
      onError: (e) => {
        if (isStatus(e, 409)) {
          setChecked(false); setChanged(true);
          setError("This material changed after you opened it. The latest version is loading; please read it again before acknowledging.");
          qc.invalidateQueries({ queryKey: getListRecordsQueryKey("education") });
        } else setError(errMsg(e));
      },
    });
  };

  return (
    <article className="rounded-2xl border border-border bg-card p-3.5" data-testid={"education-" + m.id}>
      <div className="flex items-start gap-3">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.6} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{m.title}</div>
          <div className="text-[11px] text-muted-foreground">{[version && "Version " + version, m.program].filter(Boolean).join(" · ")}</div>
        </div>
        {current ? <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(150_40%_94.5%)] px-2 py-0.5 text-[11px] font-medium text-[hsl(152_60%_24%)]" data-testid={"ack-current-" + m.id}><CheckCircle2 className="h-3 w-3" strokeWidth={1.6} />Reviewed {fmtDate(mStr(current, "acknowledgedAt") || current.createdAt)}</span>
          : <Btn size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid={"button-read-" + m.id}>{open ? "Close" : "Read"}</Btn>}
      </div>
      {!approved && <p className="mt-2 rounded-md border border-dashed border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">Demo example. Not clinically approved material.</p>}
      {prior && <p className="mt-2 flex gap-1.5 rounded-md bg-[hsl(38_95%_95%)] px-2 py-1 text-[11px] text-[hsl(30_80%_30%)]" data-testid={"ack-stale-" + m.id}><AlertTriangle className="mt-px h-3 w-3 shrink-0" strokeWidth={1.6} />You reviewed an earlier version on {fmtDate(mStr(prior, "acknowledgedAt") || prior.createdAt)}. This version needs a new review.</p>}
      {(open || (!current && changed)) && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {m.description && <p className="whitespace-pre-wrap text-sm text-foreground/85">{m.description}</p>}
          {body && <p className="whitespace-pre-wrap text-sm text-foreground/85">{body}</p>}
          <div className="space-y-0.5 text-[11px] text-muted-foreground">
            {source && <div>Source: {source}</div>}
            {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">Open full material<ExternalLink className="h-3 w-3" strokeWidth={1.6} /></a> : mStr(m, "url") ? <div>Link not shown: only secure https links are opened.</div> : null}
          </div>
          {error && <div role="alert" className="rounded-md border border-destructive/25 bg-[hsl(352_80%_98.5%)] px-2.5 py-1.5 text-xs text-destructive">{error}</div>}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={checked} onChange={(e) => setChecked(e.target.checked)} data-testid={"check-reviewed-" + m.id} />
            <span>{staff ? "The patient told me they reviewed this material." : "I reviewed this material."}</span>
          </label>
          <Btn variant="primary" className="w-full" disabled={!checked || !hash || perform.isPending} onClick={ack} data-testid={"button-ack-" + m.id}>{perform.isPending ? "Saving…" : staff ? "Document acknowledgment" : "Acknowledge"}</Btn>
          <p className={cn("text-[10.5px] text-muted-foreground")}>This records that the material was reviewed. It does not confirm understanding and is not counted as education time.</p>
        </div>
      )}
    </article>
  );
}
