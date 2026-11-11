import { useEffect, useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useGetWorklist, getGetWorklistQueryKey } from "@workspace/api-client-react";
import { EmptyState, ErrorState, PageHeader, ReadOnlyHintSlot, SkeletonRows } from "@/components/worklist/page-bits";
import { usePermission } from "@/components/access";
import { usePrefs, useSaveWorklistView } from "@/hooks/use-workspace-prefs";
import { DEFAULT_FILTERS, VIEWS, assignBlock, canAttestConsultant, fromSaved, readUrl, sameFilters, toParams, toSaved, writeUrl, type WlFilters, type WlKind } from "@/lib/worklist";
import { WorklistNav } from "@/components/worklist/worklist-nav";
import { WorklistFilters } from "@/components/worklist/worklist-filters";
import { WorklistTable } from "@/components/worklist/worklist-table";
import { CocmRegistry } from "@/components/worklist/cocm-registry";
import { WorklistPagination } from "@/components/worklist/worklist-pagination";
import { AssignBar } from "@/components/worklist/assign-bar";
import { NewStaffTask } from "@/components/worklist/staff-task-dialog";
import { DensityToggle } from "@/components/worklist/density-toggle";
import { AtRiskNote } from "@/components/worklist/at-risk-note";

type St = { kind: WlKind; page: number; f: WlFilters };

export default function WorklistsPage() {
  const { user } = usePermission();
  if (!user) return null;
  return <Worklists key={user.id} />;
}

function Worklists() {
  const { user, allow } = usePermission();
  const clinical = allow("clinical.read");
  const deviceOps = allow("devices.write");
  const allowed = useMemo(() => VIEWS.filter((v) => clinical || (v.id === "device_issues" && deviceOps)).map((v) => v.id as WlKind), [clinical, deviceOps]);
  const { q: prefs } = usePrefs();
  const saver = useSaveWorklistView();
  const [st, setSt] = useState<St | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // Initialise once: URL wins, otherwise the user's saved view. Waits for preferences so an empty loading state never overwrites saved filters.
  const prefsSettled = !prefs.isLoading;
  useEffect(() => {
    if (st || !prefsSettled || !allowed.length) return;
    const url = readUrl(window.location.search);
    const saved = prefs.data;
    const kind = url.kind && allowed.includes(url.kind) ? url.kind : saved?.lastWorklist && allowed.includes(saved.lastWorklist) ? saved.lastWorklist : allowed[0];
    const f = url.hasFilters && url.kind === kind ? url.f : fromSaved(saved?.worklists?.[kind]);
    setSt({ kind, page: url.kind === kind ? url.page : 1, f });
  }, [st, prefsSettled, prefs.data, allowed]);

  useEffect(() => { if (st) writeUrl(st.kind, st.page, st.f); }, [st]);

  const update = (next: St) => { setSelected(new Set()); setSt(next); };
  const params = toParams(st?.kind ?? allowed[0] ?? "my_exceptions", st?.page ?? 1, st?.f ?? DEFAULT_FILTERS);
  const list = useGetWorklist(params, { query: { enabled: !!st, queryKey: getGetWorklistQueryKey(params), placeholderData: keepPreviousData } });
  const data = list.data;

  // If filters shrink the result set, step back to the last real page.
  useEffect(() => {
    if (st && data && data.totalPages > 0 && st.page > data.totalPages) update({ ...st, page: data.totalPages });
  }, [data, st]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!allowed.length) {
    return (
      <div>
        <PageHeader eyebrow="Worklists" title="What needs attention" />
        <EmptyState icon={<Lock className="h-4 w-4" strokeWidth={1.6} />} title="No worklists in your access" desc="Clinical worklists need clinical access. Device issue worklists need device management access. Ask a practice administrator if your role should include either." />
      </div>
    );
  }
  if (!st) return <div><PageHeader eyebrow="Worklists" title="What needs attention" /><SkeletonRows rows={8} /></div>;

  const view = VIEWS.find((v) => v.id === st.kind)!;
  const savedF = fromSaved(prefs.data?.worklists?.[st.kind]);
  const dirty = !sameFilters(st.f, savedF);
  const sel = {
    selected,
    block: (i: Parameters<typeof assignBlock>[0]) => assignBlock(i, allow),
    onToggle: (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    onToggleAll: (ids: string[], on: boolean) => setSelected((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; }),
  };
  const status = (list.error as { status?: number } | null)?.status;
  const writable = st.kind === "device_issues" ? allow("devices.write") : allow("clinical.write");
  const showNewTask = (st.kind === "due_today" || st.kind === "tasks") && allow("clinical.write");

  return (
    <div>
      <PageHeader eyebrow="Worklists" title={view.label} desc={view.desc} actions={<div className="flex flex-wrap items-center gap-2"><DensityToggle />{showNewTask && <NewStaffTask options={data?.options} />}</div>} />
      <div className="grid gap-5 lg:grid-cols-[208px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start"><WorklistNav value={st.kind} allowed={allowed} onChange={(k) => k !== st.kind && update({ kind: k, page: 1, f: fromSaved(prefs.data?.worklists?.[k]) })} /></aside>
        <section className="min-w-0 space-y-3" aria-label={view.label + " worklist"}>
          <WorklistFilters key={st.kind} kind={st.kind} f={st.f} options={data?.options} onChange={(p) => update({ ...st, page: 1, f: { ...st.f, ...p } })}
            onSave={() => saver.save(st.kind, toSaved(st.f))} onReset={() => update({ ...st, page: 1, f: { ...DEFAULT_FILTERS } })} saving={saver.pending} dirty={dirty} />
          {!writable && <ReadOnlyHintSlot />}
          {st.kind === "at_risk" && <AtRiskNote items={data?.items} billing={allow("billing.read")} />}
          {selected.size > 0 && <AssignBar ids={[...selected]} kinds={{ clinical: (data?.items ?? []).some((i) => selected.has(i.id) && i.record.kind !== "devices"), device: (data?.items ?? []).some((i) => selected.has(i.id) && i.record.kind === "devices") }} options={data?.options} onDone={() => setSelected(new Set())} onClear={() => setSelected(new Set())} />}
          <div className="relative">
            {list.isFetching && data && <div className="absolute inset-x-0 -top-1.5 h-[2px] overflow-hidden rounded-full bg-muted"><div className="load-bar h-full w-1/3 brand-rule" /></div>}
            {!data && list.isLoading ? <SkeletonRows rows={8} /> : list.isError && !data ? (
              status === 403 ? <EmptyState icon={<Lock className="h-4 w-4" strokeWidth={1.6} />} title="This worklist isn't in your access" desc="The server declined this view for your role or sites. Choose another view or ask an administrator." />
                : <ErrorState error={list.error} onRetry={() => list.refetch()} />
            ) : !data || data.items.length === 0 ? (
              <EmptyState title={dirty || st.f.q ? "Nothing matches these filters" : "Clear for now"} desc={dirty || st.f.q ? "Widen the filters or reset this view." : "Nothing in this view needs attention right now."} />
            ) : st.kind === "cocm_registry" ? (
              <CocmRegistry items={data.items} chart={clinical} sel={sel} canTime={allow("time.write")} canReview={canAttestConsultant(user)} />
            ) : (
              <WorklistTable items={data.items} chart={clinical} sel={sel} />
            )}
            {data && data.total > 0 && <WorklistPagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} disabled={list.isFetching} onPage={(p) => update({ ...st, page: p })} onSize={(n) => update({ ...st, page: 1, f: { ...st.f, pageSize: n } })} />}
            {data && <p className="mt-2 px-1 text-[11px] text-muted-foreground">Generated {new Date(data.generatedAt).toLocaleTimeString()}. Filters and selection apply to this page only.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
