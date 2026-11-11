import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, Calculator, Check, CheckCheck, Download, Lock, Unlock, X } from "lucide-react";
import { useListRecords } from "@workspace/api-client-react";
import { Btn, ConfirmButton, EmptyState, ErrorState, Field, PageHeader, Pill, ProgramTag, SkeletonRows, Stat, StatusPill, Tabs, inputCls } from "@/components/kit";
import { DocButton } from "@/components/doc-viewer";
import { mArr, mBool, mNum, mStr, useAction, PROGRAMS } from "@/lib/api";
import { cn } from "@/lib/utils";
import {usePermission} from "@/components/access";

type F = "all" | "met" | "blocked" | "approved";
const MAX_BULK = 100;
const thisMonth = () => new Date().toISOString().slice(0,7);
const monthLabel = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }); };

export default function BillingPage() {
  const {user,allow}=usePermission(),canWrite=allow("billing.write"),canManagePeriod=canWrite&&!user?.locationScopes?.length;
  const lines = useListRecords("billing");
  const { run, pending } = useAction();
  const max = thisMonth();
  const [period, setPeriod] = useState(max);
  const [f, setF] = useState<F>("all");
  const [program, setProgram] = useState("");
  const [patient, setPatient] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const all = lines.data ?? [];
  const data = useMemo(() => all.filter((l) => mStr(l, "period") === period), [all, period]);
  const patients = useMemo(() => Array.from(new Map(data.filter((l) => l.patientId).map((l) => [l.patientId!, l.patientName])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [data]);
  const closed = data.some((l) => mBool(l, "closed") || mStr(l, "periodStatus") === "closed");
  const scoped = data.filter((l) => (!program || l.program === program) && (!patient || l.patientId === patient));
  const list = scoped.filter((l) => f === "all" ? true : f === "met" ? mBool(l, "met") : f === "blocked" ? mArr(l, "blockers").length > 0 : l.status === "approved");
  const approvable = (l: (typeof list)[number]) => mBool(l,"closed") && l.status === "candidate" && mBool(l,"met") && mArr(l, "blockers").length === 0;
  const selectable = canWrite?list.filter(approvable):[];
  const selected = selectable.filter((l) => sel.has(l.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < MAX_BULK) n.add(id); return n; });
  const allOn = selectable.length > 0 && selectable.slice(0, MAX_BULK).every((l) => sel.has(l.id));
  const toggleAll = () => setSel(allOn ? new Set() : new Set(selectable.slice(0, MAX_BULK).map((l) => l.id)));
  const changePeriod = (v: string) => { if (/^\d{4}-\d{2}$/.test(v) && v <= max) { setPeriod(v); setSel(new Set()); } };
  const q = "period=" + encodeURIComponent(period);
  const P = { period };

  return (
    <div>
      <PageHeader eyebrow={"Period " + period} title="Billing evidence" desc={closed ? "Period closed. Candidate evidence is frozen; lines can still be approved or rejected. Reopen the period to recalculate." : "Each line shows the minutes, device days and documentation behind it. CPT thresholds are provisional demo defaults, not billing advice."}
        actions={<>
          <a href={"/api/exports/billing?" + q} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3.5 text-sm font-medium hover:bg-muted" data-testid="link-export-billing"><Download className="h-4 w-4" />CSV</a>
          <a href={"/api/exports/billing?" + q + "&format=xlsx"} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3.5 text-sm font-medium hover:bg-muted" data-testid="link-export-billing-xlsx"><Download className="h-4 w-4" />XLSX</a>
          {canWrite&&<ConfirmButton size="md" label="Recalculate" icon={<Calculator className="h-4 w-4" />} title={"Recalculate " + monthLabel(period)} desc="Re-evaluates every enrolled patient against program requirements for this period." confirmLabel="Recalculate" pending={pending} onConfirm={(_, c) => run({ action: "calculateBilling", payload: P }, c)} testid="button-calculate" disabled={closed} />}
          {canManagePeriod&&(closed
            ? <ConfirmButton size="md" label="Reopen period" icon={<Unlock className="h-4 w-4" />} variant="danger" title={"Reopen " + monthLabel(period)} desc="Reopening is audited and requires a reason." reason confirmLabel="Reopen" pending={pending} onConfirm={(r, c) => run({ action: "reopenPeriod", reason: r, payload: P }, c)} testid="button-reopen" />
            : <ConfirmButton size="md" label="Close period" icon={<Lock className="h-4 w-4" />} variant="primary" title={"Close " + monthLabel(period)} desc="Freezes this period's evidence and locks source time entries. Review approvals only after closing. Nothing is submitted to a payer." confirmLabel="Close period" pending={pending} onConfirm={(_, c) => run({ action: "closePeriod", payload: P }, c)} testid="button-close-period" />)}
        </>}
      />
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-secondary/40 p-3">
        <Field label="Billing month" className="w-44"><input type="month" className={inputCls} value={period} max={max} onChange={(e) => changePeriod(e.target.value)} data-testid="input-billing-period" /></Field>
        <Field label="Program" className="w-36"><select className={inputCls} value={program} onChange={(e) => { setProgram(e.target.value); setSel(new Set()); }} data-testid="select-billing-program"><option value="">All programs</option>{PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
        <Field label="Patient" className="min-w-[200px] flex-1 sm:max-w-xs"><select className={inputCls} value={patient} onChange={(e) => { setPatient(e.target.value); setSel(new Set()); }} data-testid="select-billing-patient"><option value="">All patients</option>{patients.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></Field>
        {period !== max && <Btn size="sm" variant="ghost" onClick={() => changePeriod(max)} data-testid="button-billing-current">Current month</Btn>}
      </div>
      {lines.isLoading ? <SkeletonRows rows={6} /> : lines.isError ? <ErrorState error={lines.error} onRetry={() => lines.refetch()} /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Lines" value={scoped.length} />
            <Stat label="Requirements met" value={scoped.filter((l) => mBool(l, "met")).length} tone="green" />
            <Stat label="Blocked" value={scoped.filter((l) => mArr(l, "blockers").length).length} tone="red" />
            <Stat label="Approved" value={scoped.filter((l) => l.status === "approved").length} tone="indigo" />
          </div>
          <Tabs value={f} onChange={(v) => { setF(v); setSel(new Set()); }} tabs={[{ id: "all", label: "All" }, { id: "met", label: "Met" }, { id: "blocked", label: "Blocked" }, { id: "approved", label: "Approved" }]} />
          <div className={cn("mt-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2 text-sm transition-colors", selected.length ? "border-[hsl(var(--brand-orange))]/40 bg-accent/60" : "border-border bg-card")} data-testid="bar-bulk">
            <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={allOn} disabled={!selectable.length} onChange={toggleAll} aria-label="Select all approvable lines" data-testid="checkbox-select-all" />{selected.length ? selected.length + " selected" : selectable.length + " approvable"}</label>
            {sel.size >= MAX_BULK && <span className="text-[11px] text-muted-foreground">Limit of {MAX_BULK} per approval</span>}
            <span className="ml-auto flex gap-2">
              {selected.length > 0 && <Btn size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Btn>}
              <ConfirmButton label={"Approve " + (selected.length || "")} icon={<CheckCheck className="h-3.5 w-3.5" />} variant="primary" title={"Approve " + selected.length + " line" + (selected.length === 1 ? "" : "s")} desc={"Marks these " + monthLabel(period) + " lines approved based on recorded evidence. This does not submit a claim."} confirmLabel="Approve all" pending={pending} disabled={!selected.length || selected.length > MAX_BULK} onConfirm={(_, c) => run({ action: "bulkApproveLines", payload: { ids: selected.map((l) => l.id), period } }, () => { setSel(new Set()); c(); })} testid="button-bulk-approve" />
            </span>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-card-border bg-card">
            {!list.length ? <div className="p-4"><EmptyState title={data.length ? "No lines match" : "No lines for " + monthLabel(period)} desc={data.length ? "Adjust the program, patient or status filter." : closed ? "This period has no evidence lines." : "Run a recalculation to evaluate this period."} /></div> : list.map((l) => {
              const blockers = mArr(l, "blockers");
              const can = canWrite&&approvable(l);
              return (
                <div key={l.id} className={cn("flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:flex-row lg:items-center", sel.has(l.id) && "bg-accent/30")} data-testid={"row-billing-" + l.id}>
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))] disabled:opacity-30" disabled={!can} checked={sel.has(l.id)} onChange={() => toggle(l.id)} aria-label={"Select " + (mStr(l, "cpt") || "line") + " for " + l.patientName} data-testid={"checkbox-billing-" + l.id} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded bg-foreground px-1.5 font-mono text-[11px] font-medium text-background">{mStr(l, "cpt") || "—"}</span>
                      {l.patientId ? <Link href={"/patients/" + l.patientId} className="font-medium hover:text-primary">{l.patientName}</Link> : <span className="font-medium">{l.patientName}</span>}
                      <ProgramTag p={l.program} /><StatusPill value={l.status} />
                      {mBool(l, "met") ? <Pill tone="green">met</Pill> : <Pill tone="amber">not met</Pill>}
                      {mBool(l, "provisional") && <Pill tone="amber">provisional</Pill>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground tnum">
                      <span>{mNum(l, "minutes") ?? 0} min</span><span>{mNum(l, "deviceDays") ?? 0} device days</span><span>{mNum(l, "units") ?? 1} unit(s)</span>
                    </div>
                    {blockers.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{blockers.map((b, i) => <span key={i} className="rounded border border-destructive/25 bg-[hsl(356_80%_98%)] px-1.5 text-[11px] text-destructive">{b}</span>)}</div>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <DocButton r={l} />
                    {canWrite&&l.status !== "approved" && l.status !== "rejected" && <>
                      <ConfirmButton label="Approve" icon={<Check className="h-3.5 w-3.5" />} variant="primary" title="Approve line" desc={"Approve " + mStr(l, "cpt") + " for " + l.patientName + ". This does not submit a claim."} confirmLabel="Approve" pending={pending} onConfirm={(_, c) => run({ action: "approveLine", id: l.id }, c)} testid={"button-approve-" + l.id} disabled={!can} />
                      <ConfirmButton label="Reject" icon={<X className="h-3.5 w-3.5" />} variant="ghost" title="Reject line" reason confirmLabel="Reject" pending={pending} onConfirm={(r, c) => run({ action: "rejectLine", id: l.id, reason: r }, c)} testid={"button-reject-" + l.id} disabled={!mBool(l,"closed")}/>
                    </>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground" data-testid="note-billing-provisional"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />Close the period to freeze evidence before reviewing lines. Lines with blockers cannot be approved. CPT thresholds are provisional demo defaults, not billing advice, and nothing here is submitted to a payer.</p>
        </>
      )}
    </div>
  );
}
