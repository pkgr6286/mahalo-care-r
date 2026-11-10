import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useListRecords } from "@workspace/api-client-react";
import { Btn, EmptyState, ErrorState, PageHeader, Panel, RecordDialog, SkeletonRows, Tabs, inputCls, useRecordDialog } from "@/components/kit";
import { ExceptionRow, TaskRow, isOpen } from "@/components/records";
import { PROGRAMS } from "@/lib/api";

const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function WorklistsPage() {
  const [tab, setTab] = useState<"exceptions" | "tasks">("exceptions");
  const [q, setQ] = useState("");
  const [program, setProgram] = useState("");
  const [show, setShow] = useState<"open" | "all">("open");
  const ex = useListRecords("exceptions");
  const tasks = useListRecords("tasks");
  const dlg = useRecordDialog();

  const filter = useMemo(() => {
    return (list: typeof ex.data) =>
      (list ?? [])
        .filter((r) => (show === "open" ? isOpen(r) : true))
        .filter((r) => (program ? r.program === program : true))
        .filter((r) => (q ? `${r.title} ${r.patientName} ${r.description ?? ""}`.toLowerCase().includes(q.toLowerCase()) : true));
  }, [show, program, q]);

  const exList = filter(ex.data).sort((a, b) => (sevRank[a.severity ?? ""] ?? 9) - (sevRank[b.severity ?? ""] ?? 9));
  const taskList = filter(tasks.data).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const active = tab === "exceptions" ? ex : tasks;

  return (
    <div>
      <PageHeader
        eyebrow="Worklists"
        title="What needs a clinician"
        desc="Exceptions come from rules evaluating readings, check-ins and gaps in contact. Tasks are the follow-through."
        actions={tab === "tasks" ? <Btn variant="primary" onClick={dlg.create} data-testid="button-new-task"><Plus className="h-4 w-4" />New task</Btn> : <Btn variant="primary" onClick={dlg.create} data-testid="button-new-exception"><Plus className="h-4 w-4" />Flag exception</Btn>}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "exceptions", label: "Exceptions", count: (ex.data ?? []).filter(isOpen).length },
          { id: "tasks", label: "Tasks", count: (tasks.data ?? []).filter(isOpen).length },
        ]}
      />
      <div className="my-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input className={`${inputCls} pl-9`} placeholder="Filter by patient, title, detail" value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-filter" />
        </div>
        <select className={`${inputCls} sm:w-40`} value={program} onChange={(e) => setProgram(e.target.value)} data-testid="select-program-filter">
          <option value="">All programs</option>
          {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={`${inputCls} sm:w-36`} value={show} onChange={(e) => setShow(e.target.value as "open" | "all")} data-testid="select-show">
          <option value="open">Open only</option>
          <option value="all">Include closed</option>
        </select>
      </div>
      {active.isLoading ? <SkeletonRows rows={6} /> : active.isError ? <ErrorState error={active.error} onRetry={() => active.refetch()} /> : (
        <Panel bodyClass="py-1">
          {tab === "exceptions"
            ? exList.length ? exList.map((r) => <ExceptionRow key={r.id} r={r} />) : <div className="py-4"><EmptyState title="No matching exceptions" desc="Adjust filters or wait for the next rule evaluation." /></div>
            : taskList.length ? taskList.map((r) => <TaskRow key={r.id} r={r} />) : <div className="py-4"><EmptyState title="No matching tasks" /></div>}
        </Panel>
      )}
      <RecordDialog
        open={dlg.open}
        onOpenChange={dlg.onOpenChange}
        kind={tab}
        title={tab === "tasks" ? "New task" : "Flag an exception"}
        fields={tab === "tasks" ? ["patient", "program", "assignee", "date", "description"] : ["patient", "program", "severity", "description"]}
        defaults={{ status: "open" }}
      />
    </div>
  );
}
