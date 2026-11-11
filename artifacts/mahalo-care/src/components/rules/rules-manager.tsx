import { useMemo, useState } from "react";
import { Copy, Eye, FlaskConical, Pencil, Plus, Search, ShieldAlert } from "lucide-react";
import { useListRecords, getListRecordsQueryKey, type CareRecord } from "@workspace/api-client-react";
import { Btn, EmptyState, ErrorState, Pill, ProgramTag, SkeletonRows, StatusPill, inputCls, toneFor } from "@/components/kit";
import { PagedList } from "@/components/list-tools";
import { usePermission } from "@/components/access";
import { PROGRAMS, fmtRel } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PRESETS, RULE_KINDS, canonicalize, describeRule, kindLabel, type Rule } from "@/lib/rule-schema";
import { RuleEditor, type RuleDraft } from "./rule-editor";

type Open = { record: CareRecord | null; preset?: RuleDraft; readOnly: boolean; view?: "preview" } | null;

export function RulesManager() {
  const q = useListRecords("rules", { query: { queryKey: getListRecordsQueryKey("rules") } });
  const { allow } = usePermission();
  const isAdmin = allow();
  const canPreview = allow("clinical.write");
  const [s, setS] = useState("");
  const [kind, setKind] = useState("");
  const [program, setProgram] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<Open>(null);

  const rows = useMemo(() => (q.data ?? []).map((r) => ({ r, rule: canonicalize((r.metadata ?? {}) as Rule) })), [q.data]);
  const list = rows.filter(({ r, rule }) =>
    (!kind || rule.rule.kind === kind) && (!program || r.program === program) && (!status || r.status === status) &&
    `${r.title} ${r.description ?? ""} ${describeRule(rule.rule)}`.toLowerCase().includes(s.toLowerCase()));

  return (
    <div className="space-y-4" data-testid="rules-manager">
      <div className="flex gap-3 rounded-xl border border-[hsl(38_80%_80%)] bg-[hsl(38_95%_96.5%)] p-3 text-xs text-[hsl(30_70%_26%)]">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.6} />
        <p>Every rule is provisional and needs clinician review. Thresholds are practice configuration, not clinical guidance. Alerts and notifications in this demo go to the console outbox only.</p>
      </div>

      {isAdmin && (
        <section aria-labelledby="rule-examples" className="rounded-xl border border-card-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 id="rule-examples" className="text-sm font-semibold">Start from an example</h2><p className="text-[11px] text-muted-foreground">Opens an editable draft. Nothing is enabled until you set the status to active.</p></div>
            <Btn variant="primary" onClick={() => setOpen({ record: null, readOnly: false })} data-testid="button-new-rule"><Plus className="h-4 w-4" />New rule</Btn>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => setOpen({ record: null, readOnly: false, preset: { title: p.title, program: p.program, severity: p.severity, status: "draft", description: p.description, rule: p.rule } })}
                className="group flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs transition-colors hover:border-foreground/25 hover:bg-secondary" data-testid={`button-preset-${p.id}`}>
                <Copy className="h-3 w-3 text-muted-foreground" strokeWidth={1.6} /><ProgramTag p={p.program} />{p.title}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input aria-label="Search rules" className={cn(inputCls, "pl-8")} placeholder="Search rules" value={s} onChange={(e) => setS(e.target.value)} data-testid="input-rule-search" /></div>
        <select aria-label="Rule kind" className={cn(inputCls, "w-auto")} value={kind} onChange={(e) => setKind(e.target.value)} data-testid="filter-rule-kind"><option value="">All kinds</option>{RULE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
        <select aria-label="Program" className={cn(inputCls, "w-auto")} value={program} onChange={(e) => setProgram(e.target.value)} data-testid="filter-rule-program"><option value="">All programs</option>{PROGRAMS.map((p) => <option key={p}>{p}</option>)}</select>
        <select aria-label="Status" className={cn(inputCls, "w-auto")} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="filter-rule-status"><option value="">Any status</option>{["active", "draft", "paused"].map((x) => <option key={x}>{x}</option>)}</select>
      </div>

      {q.isLoading ? <SkeletonRows rows={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !list.length ? (
        <EmptyState icon={<FlaskConical className="h-4 w-4" strokeWidth={1.6} />} title={rows.length ? "No rules match" : "No rules yet"} desc={rows.length ? "Clear a filter to see more." : isAdmin ? "Start from an example or create a rule." : "An administrator configures rules."} />
      ) : (
        <ul className="rise overflow-hidden rounded-xl border border-card-border bg-card" aria-label="Clinical rules">
          <PagedList items={list} pageSize={20} noun="rules" testid="pager-rules" render={({ r, rule }) => (
            <li key={r.id} className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center" data-testid={`row-rules-${r.id}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{r.title}<Pill tone="neutral">{kindLabel(rule.rule.kind)}</Pill><ProgramTag p={r.program} />{r.severity && <Pill tone={toneFor(r.severity)}>{r.severity}</Pill>}<StatusPill value={r.status} />{rule.aliases.length > 0 && <Pill tone="amber">legacy fields</Pill>}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{describeRule(rule.rule)}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{[rule.rule.owner_role ? `Owner ${String(rule.rule.owner_role).replace(/_/g, " ")}` : "", rule.rule.version ? `v${rule.rule.version}` : "", `updated ${fmtRel(r.updatedAt)}`].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {canPreview && <Btn size="sm" onClick={() => setOpen({ record: r, readOnly: !isAdmin })} data-testid={`button-preview-rule-${r.id}`}><FlaskConical className="h-3.5 w-3.5" />Preview</Btn>}
                {isAdmin ? <Btn size="sm" variant="ghost" onClick={() => setOpen({ record: r, readOnly: false })} data-testid={`button-edit-${r.id}`}><Pencil className="h-3.5 w-3.5" />Edit</Btn>
                  : <Btn size="sm" variant="ghost" onClick={() => setOpen({ record: r, readOnly: true })} data-testid={`button-view-${r.id}`}><Eye className="h-3.5 w-3.5" />View</Btn>}
              </div>
            </li>
          )} />
        </ul>
      )}
      {open && <RuleEditor key={open.record?.id ?? open.preset?.title ?? "new"} record={open.record} preset={open.preset} readOnly={open.readOnly} canPreview={canPreview} onClose={() => setOpen(null)} />}
    </div>
  );
}
