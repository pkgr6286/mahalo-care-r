import { FileStack } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Pencil, Plus } from "lucide-react";
import { useGetDashboard, useListPatients, useListRecords, type Patient } from "@workspace/api-client-react";
import { Btn, EmptyState, ErrorState, PageHeader, Panel, ProgramTag, RecordDialog, SkeletonRows, StatusPill, inputCls, useRecordDialog } from "@/components/kit";
import { EnrollDialog } from "@/pages/patient-detail";
import { usePermission } from "@/components/access";
import { fmtDate, mStr, PROGRAM_NAMES } from "@/lib/api";

export default function ProgramsPage() {
  const dash = useGetDashboard();
  const programs = useListRecords("programs");
  const enrollments = useListRecords("enrollments");
  const patients = useListPatients();
  const dlg = useRecordDialog();
  const [pick, setPick] = useState("");
  const [enrollFor, setEnrollFor] = useState<Patient | null>(null);
  const [filter, setFilter] = useState("");
  const { allow } = usePermission();
  const isAdmin = allow();
  const canEnroll = allow("clinical.write");

  return (
    <div>
      <PageHeader eyebrow="Programs" title="Care programs" desc="RPM, RTM, CCM, PCM and BHI share one patient record. Requirement thresholds are provisional defaults pending compliance review." actions={<div className="flex flex-wrap gap-2"><Link href="/policies" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-input bg-card px-4 text-sm font-medium hover:bg-secondary" data-testid="link-policies"><FileStack className="h-4 w-4" />Policies and templates</Link>{isAdmin && <Btn onClick={dlg.create} data-testid="button-new-program"><Plus className="h-4 w-4" />Program config</Btn>}</div>} />
      {dash.isLoading ? <SkeletonRows rows={3} /> : dash.isError ? <ErrorState error={dash.error} onRetry={() => dash.refetch()} /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {dash.data!.programStats.map((p) => (
            <button key={p.key} onClick={() => setFilter(filter === p.key ? "" : p.key)} className={`rise rounded-xl border bg-card p-4 text-left transition-colors ${filter === p.key ? "border-primary ring-2 ring-primary/15" : "border-card-border hover:border-primary/40"}`} data-testid={`card-program-${p.key}`}>
              <div className="flex items-center justify-between"><ProgramTag p={p.key} /><span className="h-2 w-2 rounded-full" style={{ background: p.color }} /></div>
              <div className="mt-2 text-xs text-muted-foreground">{p.name}</div>
              <div className="tnum mt-3 text-2xl font-semibold">{p.enrolled}</div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span className={p.atRisk ? "text-destructive" : ""}>{p.atRisk} at risk</span><span className="tnum">{p.minutes} min</span></div>
            </button>
          ))}
        </div>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Panel title={`Enrollments${filter ? ` · ${filter}` : ""}`} bodyClass="p-0" action={canEnroll &&
          <div className="flex gap-2">
            <select className={`${inputCls} h-7 w-48 text-xs`} value={pick} onChange={(e) => setPick(e.target.value)} data-testid="select-enroll-patient">
              <option value="">Choose patient to enroll</option>
              {(patients.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.lastName}, {p.firstName}</option>)}
            </select>
            <Btn size="sm" variant="primary" disabled={!pick} onClick={() => setEnrollFor(patients.data?.find((p) => p.id === pick) ?? null)} data-testid="button-enroll-patient">Enroll</Btn>
          </div>
        }>
          {enrollments.isLoading ? <div className="p-4"><SkeletonRows rows={4} /></div> : enrollments.isError ? <div className="p-4"><ErrorState error={enrollments.error} onRetry={() => enrollments.refetch()} /></div> : (
            <div className="max-h-[520px] overflow-y-auto">
              {(enrollments.data ?? []).filter((e) => !filter || e.program === filter).map((e) => (
                <Link key={e.id} href={`/patients/${e.patientId}`} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0 hover:bg-accent/40" data-testid={`row-enrollment-${e.id}`}>
                  <ProgramTag p={e.program} />
                  <span className="flex-1 font-medium">{e.patientName}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{mStr(e, "condition")}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(e.date ?? e.createdAt)}</span>
                  <StatusPill value={e.status} />
                </Link>
              ))}
              {!(enrollments.data ?? []).length && <div className="p-4"><EmptyState title="No enrollments" /></div>}
            </div>
          )}
        </Panel>
        <Panel title="Program configuration" sub={isAdmin ? "Provisional defaults, editable" : "Provisional defaults · administrators edit"}>
          {programs.isLoading ? <SkeletonRows rows={3} /> : (programs.data ?? []).map((p) => (
            <div key={p.id} className="border-b border-border py-2.5 last:border-b-0">
              <div className="flex items-center gap-2 text-sm font-medium"><ProgramTag p={p.program ?? p.title} />{PROGRAM_NAMES[(p.program ?? "").toUpperCase()] ?? p.title}<StatusPill value={p.status} />{isAdmin && <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => dlg.edit(p)} aria-label={`Edit ${p.program ?? p.title} configuration`} data-testid={`button-edit-program-${p.id}`}><Pencil className="h-3.5 w-3.5" /></button>}</div>
              {p.description && <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>}
            </div>
          ))}
        </Panel>
      </div>
      <RecordDialog open={dlg.open} onOpenChange={dlg.onOpenChange} kind="programs" record={dlg.record} title={dlg.record ? "Edit program" : "New program config"} fields={["program", "status", "description"]} statusOptions={["active", "paused", "draft"]} meta={[{ key: "minutesThreshold", label: "Minutes threshold", type: "number" }, { key: "deviceDaysThreshold", label: "Device days threshold", type: "number" }]} />
      {enrollFor && <EnrollDialog p={enrollFor} open={!!enrollFor} onOpenChange={(o) => !o && setEnrollFor(null)} />}
    </div>
  );
}
