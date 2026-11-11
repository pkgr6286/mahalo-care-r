import { useState } from "react";
import { Check, Copy, FileCode2, FileDown, History, RotateCw, ShieldAlert } from "lucide-react";
import { useListDocumentVersions, getListDocumentVersionsQueryKey, type CareRecord, type DocumentVersion } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, EmptyState, ErrorState, Pill, SkeletonRows, StatusPill, type Tone } from "@/components/kit";
import { fmtDateTime } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isRetainedDocument } from "@/lib/record-lifecycle";

const ORIGIN: Record<string, { label: string; tone: Tone; note: string }> = {
  signature: { label: "Signed", tone: "green", note: "PDF bytes stored when the record was signed." },
  consent_capture: { label: "Consent captured", tone: "teal", note: "PDF bytes stored when consent was recorded." },
  consent_revocation: { label: "Consent revoked", tone: "amber", note: "PDF bytes stored when consent was revoked." },
  billing_close: { label: "Billing closed", tone: "navy", note: "PDF bytes stored when the billing period was closed." },
  billing_review: { label: "Billing reviewed", tone: "navy", note: "PDF bytes retained with the human billing decision." },
  legacy_capture: { label: "Legacy capture", tone: "neutral", note: "Captured on first download of an older record. Not the original signing-time bytes." },
};
const origin = (o: string) => ORIGIN[o] ?? { label: o.replace(/_/g, " "), tone: "neutral" as Tone, note: "" };
const fmtSize = (n: number) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB");
const isPreviewStatus = (r: CareRecord) => !isRetainedDocument(r);

export function HistoryButton({ r }: { r: CareRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn size="sm" variant="ghost" onClick={() => setOpen(true)} title="Retained PDF history" data-testid={"button-doc-history-" + r.id}><History className="h-3.5 w-3.5" strokeWidth={1.6} />History</Btn>
      {open && <DocumentHistoryDialog record={r} onClose={() => setOpen(false)} />}
    </>
  );
}

export function DocumentHistoryDialog({ record, onClose }: { record: CareRecord; onClose: () => void }) {
  const q = useListDocumentVersions(record.id, { query: { queryKey: getListDocumentVersionsQueryKey(record.id) } });
  const items = [...(q.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document history · {record.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">Current record <StatusPill value={record.status} />{isPreviewStatus(record) && <span>In this state downloads are unretained previews; earlier sealed versions below stay available.</span>}</DialogDescription>
        </DialogHeader>
        <Boundary />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tnum">{q.data ? items.length + " retained file" + (items.length === 1 ? "" : "s") : ""}</span>
          <Btn size="sm" variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-doc-history-refresh"><RotateCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} strokeWidth={1.6} />Refresh</Btn>
        </div>
        {q.isLoading ? <SkeletonRows rows={3} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !items.length ? (
          <EmptyState icon={<History className="h-4 w-4" strokeWidth={1.6} />} title="No retained files yet" desc={isPreviewStatus(record) ? "Files are retained when this record is signed, consent is captured or revoked, or the billing period is closed." : "This record was signed or closed before retention existed. Its first PDF download stores a copy labelled legacy capture, which is not the original signing-time file. Refresh after downloading."} />
        ) : (
          <ol className="space-y-2.5" data-testid="list-doc-versions">{items.map((d) => <VersionCard key={d.id} d={d} currentId={record.id} />)}</ol>
        )}
        <DialogFooter><Btn variant="ghost" onClick={onClose}>Close</Btn></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Boundary() {
  return (
    <div className="flex gap-2 rounded-lg border border-dashed border-[hsl(38_80%_70%)] bg-[hsl(38_95%_96%)] px-3 py-2 text-[11px] leading-relaxed text-[hsl(30_80%_26%)]" data-testid="note-doc-boundary">
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
      <span>Synthetic demo data, not for clinical use. Files are stored in this practice's local database with SHA-256 checksums so later changes are detectable. This is not a cryptographic or Adobe digital signature, not cloud archival, and not legal approval.</span>
    </div>
  );
}

function VersionCard({ d, currentId }: { d: DocumentVersion; currentId: string }) {
  const o = origin(d.origin);
  const base = "/api/documents/" + encodeURIComponent(d.recordId) + "/versions/" + encodeURIComponent(d.id);
  const link = "inline-flex h-8 items-center gap-1.5 rounded-full border border-input bg-card px-3 text-xs font-medium hover:bg-secondary";
  return (
    <li className="rounded-xl border border-card-border bg-card p-3" data-testid={"card-doc-version-" + d.id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-serif text-base">Artifact v{d.version}</span>
        <Pill tone={o.tone}>{o.label}</Pill>
        {d.recordId !== currentId && <Pill tone="neutral">Earlier clinical revision</Pill>}
        <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(d.createdAt)}</span>
      </div>
      {o.note && <p className="mt-1 text-[11px] text-muted-foreground">{o.note}</p>}
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        <Fact k="Source revision" v={d.sourceVersion} mono />
        <Fact k="Size" v={fmtSize(d.size)} />
        <Fact k="Stored by" v={d.createdBy || "system"} />
        <Fact k="Storage" v={d.storageBackend==="app_storage_private"?"Private cloud storage":["postgres", "postgres_local_demo"].includes(d.storageBackend) ? "Legacy local database" : d.storageBackend} />
        <Hash k="PDF SHA-256" v={d.sha256} />
        <Hash k="Source SHA-256" v={d.sourceHash} />
      </dl>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <a href={base} target="_blank" rel="noreferrer" className={link} data-testid={"link-doc-version-pdf-" + d.id}><FileDown className="h-3.5 w-3.5" strokeWidth={1.6} />Download PDF</a>
        <a href={base + "/source"} target="_blank" rel="noreferrer" className={link} data-testid={"link-doc-version-source-" + d.id}><FileCode2 className="h-3.5 w-3.5" strokeWidth={1.6} />Source manifest</a>
      </div>
    </li>
  );
}
function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return <div className="flex min-w-0 gap-1.5"><dt className="shrink-0 text-muted-foreground">{k}</dt><dd className={cn("truncate", mono && "font-mono")}>{v}</dd></div>;
}
function Hash({ k, v }: { k: string; v: string }) {
  const [done, setDone] = useState(false);
  const copy = () => navigator.clipboard?.writeText(v).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => undefined);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="truncate font-mono" title={v}>{v ? v.slice(0, 12) + "…" + v.slice(-6) : "—"}</dd>
      {v && <button type="button" onClick={copy} aria-label={"Copy " + k} className="rounded p-0.5 text-muted-foreground hover:text-foreground">{done ? <Check className="h-3.5 w-3.5" strokeWidth={1.6} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.6} />}</button>}
    </div>
  );
}
