import { useState } from "react";
import { Link } from "wouter";
import { Calculator, Check, Download, Lock, Unlock, X } from "lucide-react";
import { useListRecords } from "@workspace/api-client-react";
import { ConfirmButton, EmptyState, ErrorState, PageHeader, Pill, ProgramTag, SkeletonRows, Stat, StatusPill, Tabs } from "@/components/kit";
import { DocButton } from "@/components/doc-viewer";
import { mArr, mBool, mNum, mStr, useAction } from "@/lib/api";
import { cn } from "@/lib/utils";

type F = "all" | "met" | "blocked" | "approved";

export default function BillingPage() {
  const lines = useListRecords("billing");
  const { run, pending } = useAction();
  const [f, setF] = useState<F>("all");
  const data = lines.data ?? [];
  const period = mStr(data[0], "period");
  const closed = data.some((l) => mBool(l, "closed") || mStr(l, "periodStatus") === "closed");
  const list = data.filter((l) => f === "all" ? true : f === "met" ? mBool(l, "met") : f === "blocked" ? mArr(l, "blockers").length > 0 : l.status === "approved");

  return (
    <div>
      <PageHeader eyebrow={period ? `Period ${period}` : "Billing"} title="Billing evidence" desc={closed ? "Period closed. Candidate evidence is frozen; lines can still be approved or rejected. Reopen the period to recalculate." : "Each line shows the minutes, device days and documentation behind it. CPT thresholds are provisional demo defaults, not billing advice."}
        actions={<>
          <a href="/api/exports/billing" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3.5 text-sm font-medium hover:bg-muted" data-testid="link-export-billing"><Download className="h-4 w-4" />CSV</a>
          <a href="/api/exports/billing?format=xlsx" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3.5 text-sm font-medium hover:bg-muted" data-testid="link-export-billing-xlsx"><Download className="h-4 w-4" />XLSX</a>
          <ConfirmButton size="md" label="Recalculate" icon={<Calculator className="h-4 w-4" />} title="Recalculate period" desc="Re-evaluates every enrolled patient against program requirements." confirmLabel="Recalculate" pending={pending} onConfirm={(_, c) => run({ action: "calculateBilling" }, c)} testid="button-calculate" disabled={closed} />
          {closed
            ? <ConfirmButton size="md" label="Reopen period" icon={<Unlock className="h-4 w-4" />} variant="danger" title="Reopen billing period" desc="Reopening is audited and requires a reason." reason confirmLabel="Reopen" pending={pending} onConfirm={(r, c) => run({ action: "reopenPeriod", reason: r }, c)} testid="button-reopen" />
            : <ConfirmButton size="md" label="Close period" icon={<Lock className="h-4 w-4" />} variant="primary" title="Close billing period" desc="Locks approved lines for submission. Time and notes in this period become read-only." confirmLabel="Close period" pending={pending} onConfirm={(_, c) => run({ action: "closePeriod" }, c)} testid="button-close-period" />}
        </>}
      />
      {lines.isLoading ? <SkeletonRows rows={6} /> : lines.isError ? <ErrorState error={lines.error} onRetry={() => lines.refetch()} /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Lines" value={data.length} />
            <Stat label="Requirements met" value={data.filter((l) => mBool(l, "met")).length} tone="green" />
            <Stat label="Blocked" value={data.filter((l) => mArr(l, "blockers").length).length} tone="red" />
            <Stat label="Approved" value={data.filter((l) => l.status === "approved").length} tone="indigo" />
          </div>
          <Tabs value={f} onChange={setF} tabs={[{ id: "all", label: "All" }, { id: "met", label: "Met" }, { id: "blocked", label: "Blocked" }, { id: "approved", label: "Approved" }]} />
          <div className="mt-4 overflow-hidden rounded-xl border border-card-border bg-card">
            {!list.length ? <div className="p-4"><EmptyState title="No lines" desc="Run a recalculation to evaluate the period." /></div> : list.map((l) => {
              const blockers = mArr(l, "blockers");
              return (
                <div key={l.id} className="flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:flex-row lg:items-center" data-testid={`row-billing-${l.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded bg-foreground px-1.5 font-mono text-[11px] font-medium text-white">{mStr(l, "cpt") || "—"}</span>
                      {l.patientId ? <Link href={`/patients/${l.patientId}`} className="font-medium hover:text-primary">{l.patientName}</Link> : <span className="font-medium">{l.patientName}</span>}
                      <ProgramTag p={l.program} /><StatusPill value={l.status} />
                      {mBool(l, "met") ? <Pill tone="green">met</Pill> : <Pill tone="amber">not met</Pill>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground tnum">
                      <span>{mNum(l, "minutes") ?? 0} min</span><span>{mNum(l, "deviceDays") ?? 0} device days</span><span>{mNum(l, "units") ?? 1} unit(s)</span>
                    </div>
                    {blockers.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{blockers.map((b, i) => <span key={i} className="rounded border border-destructive/25 bg-[hsl(356_80%_98%)] px-1.5 text-[11px] text-destructive">{b}</span>)}</div>}
                  </div>
                  {(
                    <div className="flex items-center gap-1.5">
                      <DocButton r={l} />
                      {l.status !== "approved" && l.status !== "rejected" && <>
                      <ConfirmButton label="Approve" icon={<Check className="h-3.5 w-3.5" />} variant="primary" title="Approve line" desc={`Approve ${mStr(l, "cpt")} for ${l.patientName}.`} confirmLabel="Approve" pending={pending} onConfirm={(_, c) => run({ action: "approveLine", id: l.id }, c)} testid={`button-approve-${l.id}`} disabled={blockers.length > 0} />
                      <ConfirmButton label="Reject" icon={<X className="h-3.5 w-3.5" />} variant="ghost" title="Reject line" reason confirmLabel="Reject" pending={pending} onConfirm={(r, c) => run({ action: "rejectLine", id: l.id, reason: r }, c)} testid={`button-reject-${l.id}`} />
                      </>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className={cn("mt-3 text-[11px] text-muted-foreground")}>Lines with blockers cannot be approved until evidence is complete. CPT thresholds are provisional demo defaults, not billing advice.</p>
        </>
      )}
    </div>
  );
}
