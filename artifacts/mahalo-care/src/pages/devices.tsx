import { useState } from "react";
import { Link } from "wouter";
import { Pencil, Plus, Search } from "lucide-react";
import { useListRecords } from "@workspace/api-client-react";
import { Btn, EmptyState, ErrorState, PageHeader, ProgramTag, RecordDialog, SimLabel, SkeletonRows, StatusPill, inputCls, useRecordDialog } from "@/components/kit";
import { PagedList } from "@/components/list-tools";
import { fmtRel, mStr } from "@/lib/api";

export default function DevicesPage() {
  const q = useListRecords("devices");
  const dlg = useRecordDialog();
  const [s, setS] = useState("");
  const list = (q.data ?? []).filter((d) => `${d.title} ${d.patientName} ${mStr(d, "serial")}`.toLowerCase().includes(s.toLowerCase()));
  return (
    <div>
      <PageHeader eyebrow="Devices" title="Connected devices" desc={<span className="inline-flex flex-wrap items-center gap-2">Cuffs, scales and oximeters assigned to patients. <SimLabel text="Vendor feeds simulated" /></span>} actions={<Btn variant="primary" onClick={dlg.create} data-testid="button-new-device"><Plus className="h-4 w-4" />Assign device</Btn>} />
      <div className="relative mb-4"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={`${inputCls} pl-9`} placeholder="Search device, serial, patient" value={s} onChange={(e) => setS(e.target.value)} data-testid="input-search-devices" /></div>
      {q.isLoading ? <SkeletonRows rows={6} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !list.length ? <EmptyState title="No devices" action={<Btn variant="primary" onClick={dlg.create}>Assign device</Btn>} /> : (
        <div className="rise overflow-hidden rounded-xl border border-card-border bg-card">
          <PagedList items={list} pageSize={20} noun="devices" testid="pager-devices" render={(d) => (
            <div key={d.id} className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center" data-testid={`row-device-${d.id}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">{d.title}<ProgramTag p={d.program} /><StatusPill value={d.status} /></div>
                <div className="text-xs text-muted-foreground">Serial <span className="font-mono">{mStr(d, "serial") || "not recorded"}</span>{mStr(d, "vendor") && <> · {mStr(d, "vendor")}</>} · last sync {fmtRel(mStr(d, "lastSync") || d.updatedAt)}</div>
              </div>
              {d.patientId ? <Link href={`/patients/${d.patientId}`} className="text-sm font-medium hover:text-primary">{d.patientName}</Link> : <span className="text-xs text-muted-foreground">Unassigned</span>}
              <Btn size="sm" variant="ghost" onClick={() => dlg.edit(d)} data-testid={`button-edit-device-${d.id}`}><Pencil className="h-3.5 w-3.5" /><span className="sr-only">Edit device</span></Btn>
            </div>
          )} />
        </div>
      )}
      <RecordDialog open={dlg.open} onOpenChange={dlg.onOpenChange} kind="devices" record={dlg.record} title={dlg.record ? "Edit device" : "Assign device"} titleLabel="Device model" fields={["patient", "program", "status"]} statusOptions={["active", "pending", "inactive", "returned"]} defaults={{ program: "RPM" }} meta={[{ key: "serial", label: "Serial" }, { key: "vendor", label: "Vendor" }]} />
    </div>
  );
}
