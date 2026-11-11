import { useMemo, useState } from "react";
import { FileStack, Plus, ShieldAlert } from "lucide-react";
import { useListProgramPolicies, getListProgramPoliciesQueryKey } from "@workspace/api-client-react";
import { Btn, EmptyState, ErrorState, PageHeader, Pill, ProgramTag, SkeletonRows, Tabs, inputCls } from "@/components/kit";
import { PagedList } from "@/components/list-tools";
import { PolicyEditor } from "@/components/policy/policy-editor";
import { PolicyDetail, STATUS_TONE } from "@/components/policy/policy-detail";
import { PROGRAMS, fmtDate } from "@/lib/api";
import { cn } from "@/lib/utils";
import { POLICY_KINDS, type PolicyKind, type PolicyProgram } from "@/lib/policy";

type KindTab = "all" | PolicyKind;

export default function PoliciesPage() {
  const q = useListProgramPolicies({ query: { queryKey: getListProgramPoliciesQueryKey() } });
  const [kind, setKind] = useState<KindTab>("all");
  const [program, setProgram] = useState<string>("");
  const [showRetired, setShowRetired] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "create">("view");

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const canManage = !!q.data?.canManage;
  const canReview = !!q.data?.canReview;
  const filtered = useMemo(
    () => items
      .filter((p) => (kind === "all" || p.kind === kind) && (!program || p.program === program) && (showRetired || p.status !== "retired"))
      .sort((a, b) => a.program.localeCompare(b.program) || a.kind.localeCompare(b.kind) || b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt)),
    [items, kind, program, showRetired],
  );
  const current = items.find((p) => p.id === selected) ?? filtered.find((p) => p.status === "published") ?? filtered[0] ?? null;
  const pick = (id: string) => { setSelected(id); setMode("view"); };
  const presetKind: PolicyKind = kind === "all" ? "rulepack" : kind;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Programs"
        title="Policies and templates"
        desc="Care program defaults and reusable clinical templates."
        actions={canManage ? <Btn variant="primary" onClick={() => { setMode("create"); setSelected(null); }} data-testid="button-new-policy"><Plus className="h-4 w-4" />New draft</Btn> : undefined}
      />

      <div className="flex gap-2.5 rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-xs text-muted-foreground" data-testid="banner-provisional">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(30_70%_36%)]" strokeWidth={1.6} />
        <p><span className="font-medium text-foreground">Bundled baselines</span> are starting points shipped with the workspace, not payer- or clinically-approved policy. <span className="font-medium text-foreground">Published</span> versions are the ones your practice reviewed and approved. Publishing applies to new enrollments; existing enrollments stay on their version.</p>
      </div>

      <Tabs
        value={kind} onChange={setKind}
        tabs={[{ id: "all" as const, label: "All", count: items.length }, ...POLICY_KINDS.map((k) => ({ id: k.id, label: k.label, count: items.filter((p) => p.kind === k.id).length }))]}
      />

      {q.isLoading ? <SkeletonRows rows={6} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <aside className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="filter-program">Program</label>
              <select id="filter-program" className={cn(inputCls, "h-8 w-auto text-xs")} value={program} onChange={(e) => setProgram(e.target.value)} data-testid="filter-program">
                <option value="">All programs</option>{PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--brand-orange))]" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} data-testid="filter-retired" />Show retired</label>
            </div>
            {kind !== "all" && <p className="text-[11px] text-muted-foreground">{POLICY_KINDS.find((k) => k.id === kind)?.desc}</p>}
            {!filtered.length ? (
              <EmptyState icon={<FileStack className="h-4 w-4" strokeWidth={1.6} />} title="No versions here" desc={canManage ? "Start a draft, or clone a bundled baseline from another filter." : "Nothing matches these filters."} action={canManage ? <Btn size="sm" onClick={() => setMode("create")}><Plus className="h-3.5 w-3.5" />New draft</Btn> : undefined} />
            ) : (
              <ul className="overflow-hidden rounded-xl border border-card-border bg-card" aria-label="Policy versions">
                <PagedList items={filtered} pageSize={15} noun="versions" testid="pager-policies" render={(p) => (
                  <li key={p.id} className="border-b border-border last:border-b-0">
                    <button
                      onClick={() => pick(p.id)} aria-current={current?.id === p.id && mode !== "create" ? "true" : undefined} data-testid={`row-policy-${p.id}`}
                      className={cn("flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:bg-secondary focus-visible:outline-none", current?.id === p.id && mode !== "create" && "bg-secondary shadow-[inset_3px_0_0_hsl(var(--brand-orange))]")}
                    >
                      <span className="flex items-center gap-2"><ProgramTag p={p.program} /><span className="min-w-0 flex-1 truncate text-sm" title={p.version}>{p.status==="bundled"?"Included baseline":p.version}</span><Pill tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Pill></span>
                      <span className="flex gap-2 text-[11px] text-muted-foreground"><span>{POLICY_KINDS.find((k) => k.id === p.kind)?.short}</span>{p.payer && <span className="truncate">· {p.payer}</span>}<span className="ml-auto tnum">from {fmtDate(p.effectiveFrom)}</span></span>
                    </button>
                  </li>
                )} />
              </ul>
            )}
          </aside>

          <section aria-label="Selected policy" className="min-w-0">
            {mode === "create" ? (
              <PolicyEditor key="new" preset={{ kind: presetKind, program: (program || "RPM") as PolicyProgram }} bases={items} onCancel={() => setMode("view")} onSaved={(p) => pick(p.id)} />
            ) : mode === "edit" && current ? (
              <PolicyEditor key={current.id} initial={current} bases={items} onCancel={() => setMode("view")} onSaved={(p) => pick(p.id)} />
            ) : current ? (
              <PolicyDetail key={current.id} base={current} canManage={canManage} canReview={canReview} onEdit={() => setMode("edit")} onSelect={pick} />
            ) : (
              <EmptyState icon={<FileStack className="h-4 w-4" strokeWidth={1.6} />} title="No version selected" desc="Pick a version from the list." />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
