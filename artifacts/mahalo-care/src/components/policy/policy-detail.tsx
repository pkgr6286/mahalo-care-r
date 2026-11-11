import { useState } from "react";
import { FlaskConical, Lock, Pencil } from "lucide-react";
import { getGetProgramPolicyQueryKey, useGetProgramPolicy, useValidateProgramPolicy, type ProgramPolicy, type ProgramPolicyValidation } from "@workspace/api-client-react";
import { Btn, Panel, Pill, ProgramTag, Tabs, type Tone } from "@/components/kit";
import { fmtDate, fmtDateTime } from "@/lib/api";
import { isEditable, kindLabel, policyErrors, toPolicyInput, type Body } from "@/lib/policy";
import { RulepackGuided } from "./rulepack-guided";
import { CloneAction, PublishAction, RetireAction, ReviewAction } from "./policy-actions";
import { ErrorList, ValidationResult } from "./validation-result";

export const STATUS_TONE: Record<string, Tone> = { bundled: "navy", draft: "neutral", reviewed: "indigo", published: "green", retired: "neutral" };

export function PolicyDetail({ base, canManage, canReview, onEdit, onSelect }: { base: ProgramPolicy; canManage: boolean; canReview: boolean; onEdit: () => void; onSelect: (id: string) => void }) {
  const q = useGetProgramPolicy(base.id, { query: { queryKey: getGetProgramPolicyQueryKey(base.id) } });
  const p = q.data ?? base;
  const [view, setView] = useState<"summary" | "json">("summary");
  const validate = useValidateProgramPolicy();
  const [result, setResult] = useState<ProgramPolicyValidation | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const preview = () => { setErrs([]); validate.mutate({ data: toPolicyInput(p) }, { onSuccess: setResult, onError: (e) => { setResult(null); setErrs(policyErrors(e)); } }); };

  const actions = (
    <div className="flex flex-wrap gap-2">
      {canManage && isEditable(p) && <Btn size="sm" onClick={onEdit} data-testid="button-edit-draft"><Pencil className="h-3.5 w-3.5" />Edit draft</Btn>}
      {canReview && p.status === "draft" && <ReviewAction p={p} />}
      {canManage && p.status === "reviewed" && <PublishAction p={p} />}
      {canManage && p.status === "published" && <RetireAction p={p} />}
      {canManage && <CloneAction p={p} onCloned={(n) => onSelect(n.id)} />}
      {(canManage || canReview) && <Btn size="sm" variant="ghost" onClick={preview} disabled={validate.isPending} data-testid="button-preview"><FlaskConical className="h-3.5 w-3.5" />{validate.isPending ? "Checking…" : "Preview evidence"}</Btn>}
    </div>
  );

  return (
    <Panel
      title={<span className="inline-flex flex-wrap items-center gap-2"><span className="text-base">{p.status==="bundled"?`${p.program} baseline`:p.version}</span><Pill tone={STATUS_TONE[p.status] ?? "neutral"} dot>{p.status}</Pill>{p.provisional && <Pill tone="amber">Provisional</Pill>}{p.immutable && <Pill tone="neutral"><Lock className="mr-1 inline h-3 w-3" strokeWidth={1.6} />Read-only</Pill>}</span>}
      sub={<span className="inline-flex items-center gap-2"><ProgramTag p={p.program} />{kindLabel(p.kind)}{p.payer ? ` · ${p.payer}` : ""}</span>}
    >
      <div className="space-y-4" data-testid="policy-detail">
        {actions}
        {p.status === "bundled" && <Note>Included starting point. Clone to draft to adapt it for your practice.</Note>}
        {(p.status === "reviewed" || p.status === "published" || p.status === "retired") && <Note>Body frozen at review. Clone to change it.</Note>}
        {!canManage && !canReview && <Note>Read-only access. You can read every version; changes need a reviewer or administrator.</Note>}

        <dl className="grid gap-x-4 gap-y-3 rounded-xl border border-border bg-secondary/30 p-3 text-sm sm:grid-cols-3">
          <Meta l="Effective from" v={fmtDate(p.effectiveFrom)} />
          <Meta l="Patients using this version" v={p.enrollmentCount !== undefined ? String(p.enrollmentCount) : "—"} />
          <Meta l="Practice review" v={p.reviewedAt ? fmtDateTime(p.reviewedAt) : "Not reviewed"} />
        </dl>
        <details className="rounded-xl border border-border p-3 text-xs" data-testid="details-policy-version">
          <summary className="cursor-pointer font-medium text-muted-foreground">Review and version details</summary>
          <dl className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <Meta l="Stored version" v={p.version} mono />
            <Meta l="Created" v={`${fmtDateTime(p.createdAt)} · ${p.createdBy}`} />
            <Meta l="Fingerprint" v={p.fingerprint ? p.fingerprint.slice(0, 16) : "—"} mono title={p.fingerprint} />
            <Meta l="Reviewer" v={p.reviewedBy || "Not reviewed"} />
            <Meta l="Published" v={p.publishedAt ? fmtDateTime(p.publishedAt) : "—"} />
            <Meta l="Source reference" v={p.sourceRef || "None recorded"} wide />
            {p.reviewNote && <Meta l="Review note" v={p.reviewNote} wide />}
          </dl>
        </details>

        <ErrorList errors={errs} />
        {result && <ValidationResult v={result} />}

        <div>
          <Tabs className="mb-3" value={view} onChange={setView} tabs={[{ id: "summary" as const, label: "Summary" }, { id: "json" as const, label: "Advanced: raw body" }]} />
          {view === "json" ? (
            <pre tabIndex={0} aria-label="Policy body JSON" className="max-h-[480px] overflow-auto rounded-xl border border-border bg-[hsl(var(--brand-charcoal))] p-3 font-mono text-[11.5px] leading-relaxed text-[hsl(var(--background))]">{JSON.stringify(p.body, null, 2)}</pre>
          ) : <BodySummary kind={p.kind} body={p.body} />}
        </div>
      </div>
    </Panel>
  );
}

function BodySummary({ kind, body }: { kind: string; body: Body }) {
  if (kind === "rulepack") return <RulepackGuided body={body} readOnly />;
  if (kind === "note_template") {
    const secs = Array.isArray(body.sections) ? (body.sections as { key?: string; label?: string; required?: boolean }[]) : [];
    return (
      <div className="rounded-xl border border-border">
        <div className="border-b border-border px-4 py-2 text-sm font-medium">{String(body.title ?? "Untitled")} <span className="font-mono text-xs text-muted-foreground">{String(body.key ?? "")}</span></div>
        <ol className="divide-y divide-border">{secs.map((s, i) => <li key={i} className="flex items-center gap-2 px-4 py-2 text-sm"><span className="tnum w-5 text-xs text-muted-foreground">{i + 1}</span><span className="flex-1">{s.label}</span><span className="font-mono text-[11px] text-muted-foreground">{s.key}</span>{s.required && <Pill tone="teal">Required</Pill>}</li>)}</ol>
      </div>
    );
  }
  if (kind === "careplan_template") {
    const s = (body.sections && typeof body.sections === "object" ? body.sections : {}) as Record<string, unknown>;
    const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
    return (
      <div className="space-y-3 rounded-xl border border-border p-4 text-sm">
        <div><span className="font-mono text-xs text-muted-foreground">{String(body.key ?? "")}</span><p className="mt-0.5">{String(body.description ?? "")}</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <List t="Goals" items={arr(s.goals)} /><List t="Interventions" items={arr(s.interventions)} />
        </div>
        <dl className="grid gap-3 sm:grid-cols-3"><Meta l="Care team" v={String(s.careTeam ?? "—")} /><Meta l="Review every" v={s.reviewDays ? `${s.reviewDays} days` : "—"} /><Meta l="Scheduled items" v={String(Array.isArray(body.items) ? body.items.length : 0)} /></dl>
        <Meta l="Expected outcome" v={String(s.expectedOutcome ?? "—")} />
      </div>
    );
  }
  const codes = Array.isArray(body.codes) ? (body.codes as Record<string, unknown>[]) : [];
  return (
    <div className="rounded-xl border border-border p-4 text-sm">
      <Meta l="Tightens base" v={String(body.basePolicyId ?? "—")} mono />
      <ul className="mt-3 divide-y divide-border">{codes.map((c, i) => <li key={i} className="flex flex-wrap gap-x-4 py-1.5 text-xs"><span className="font-mono font-medium">{String(c.cpt)}</span>{Object.entries(c).filter(([k]) => k !== "cpt").map(([k, v]) => <span key={k} className="text-muted-foreground">{k.replace(/_/g, " ")}: <span className="tnum text-foreground">{String(v)}</span></span>)}</li>)}</ul>
    </div>
  );
}

function List({ t, items }: { t: string; items: string[] }) {
  return <div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t}</div><ul className="mt-1 list-disc space-y-0.5 pl-4">{items.length ? items.map((x, i) => <li key={i}>{x}</li>) : <li className="list-none text-muted-foreground">None</li>}</ul></div>;
}
function Meta({ l, v, mono, wide, title }: { l: string; v: string; mono?: boolean; wide?: boolean; title?: string }) {
  return <div className={wide ? "sm:col-span-3" : "min-w-0"} title={title}><dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{l}</dt><dd className={"mt-0.5 break-words " + (mono ? "font-mono text-xs" : "")}>{v}</dd></div>;
}
function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">{children}</p>;
}
