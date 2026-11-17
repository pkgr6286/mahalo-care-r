import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileDown, History } from "lucide-react";
import { useListDocumentVersions, type CareRecord } from "@workspace/api-client-react";
import { Btn, EmptyState, ErrorState, SkeletonRows, StatusPill } from "@/components/kit";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDateTime } from "@/lib/api";
import { downloadFile } from "@/lib/http";

/** Match the released care-plan states permitted by the document routes. */
export function patientSignedPlans(records: CareRecord[], patientId: string) {
  return records
    .filter((r) => r.patientId === patientId && r.kind === "careplans" && ["active", "superseded", "closed"].includes(r.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function PatientPlanDocuments({ plans }: { plans: CareRecord[] }) {
  return (
    <section className="space-y-3" aria-label="Signed care plan documents" data-testid="patient-plan-documents">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signed plan PDFs</h2>
      <p className="text-xs text-muted-foreground">Download your signed plans, including earlier plans and their retained PDF history.</p>
      {plans.map((plan) => <PlanDocument key={plan.id} plan={plan} />)}
    </section>
  );
}

function PlanDocument({ plan }: { plan: CareRecord }) {
  const [history, setHistory] = useState(false);
  const download = useMutation({
    mutationFn: () => downloadFile(`/documents/${encodeURIComponent(plan.id)}`, "signed-care-plan.pdf"),
  });
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{plan.title}</span>
        <StatusPill value={plan.status} />
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Btn size="sm" disabled={download.isPending} onClick={() => download.mutate()} data-testid={`button-patient-plan-pdf-${plan.id}`}>
            <FileDown className="h-3.5 w-3.5" strokeWidth={1.6} />{download.isPending ? "Downloading…" : "Download PDF"}
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => setHistory(true)} data-testid={`button-patient-plan-history-${plan.id}`}>
            <History className="h-3.5 w-3.5" strokeWidth={1.6} />History
          </Btn>
        </div>
      </div>
      {download.isError && <div className="mt-2" role="alert"><ErrorState error={download.error} onRetry={() => download.mutate()} /></div>}
      {history && <PlanHistory plan={plan} onClose={() => setHistory(false)} />}
    </div>
  );
}

function PlanHistory({ plan, onClose }: { plan: CareRecord; onClose: () => void }) {
  const versions = useListDocumentVersions(plan.id, { query: { staleTime: 0, retry: false } });
  const download = useMutation({
    mutationFn: ({ recordId, id }: { recordId: string; id: string }) =>
      downloadFile(`/documents/${encodeURIComponent(recordId)}/versions/${encodeURIComponent(id)}`, "signed-care-plan.pdf"),
  });
  const items = [...(versions.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Signed plan history · {plan.title}</DialogTitle>
          <DialogDescription>Retained copies of your signed plan. A legacy capture is a copy saved later, not the original signing-time PDF.</DialogDescription>
        </DialogHeader>
        {versions.isLoading ? <SkeletonRows rows={3} /> : versions.isError ? <ErrorState error={versions.error} onRetry={() => versions.refetch()} /> : !items.length ? (
          <EmptyState title="No retained PDFs yet" desc="For older signed plans, use Download PDF to save a labelled legacy copy, then reopen History." />
        ) : (
          <ol className="space-y-2" data-testid="patient-plan-history">
            {items.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-xs">
                <div className="flex-1">
                  <p className="font-medium">{version.origin === "legacy_capture" ? "Legacy capture" : "Signed plan"} · PDF v{version.version}</p>
                  <p className="mt-1 text-muted-foreground">{fmtDateTime(version.createdAt)}{version.recordId !== plan.id ? " · Earlier plan revision" : ""}</p>
                </div>
                <Btn size="sm" disabled={download.isPending} onClick={() => download.mutate(version)} data-testid={`button-patient-plan-version-${version.id}`}>
                  <FileDown className="h-3.5 w-3.5" strokeWidth={1.6} />{download.isPending && download.variables?.id === version.id ? "Downloading…" : "Download PDF"}
                </Btn>
              </li>
            ))}
          </ol>
        )}
        {download.isError && <div role="alert"><ErrorState error={download.error} onRetry={() => download.variables && download.mutate(download.variables)} /></div>}
        <div className="flex justify-end"><Btn variant="ghost" onClick={onClose}>Close</Btn></div>
      </DialogContent>
    </Dialog>
  );
}
