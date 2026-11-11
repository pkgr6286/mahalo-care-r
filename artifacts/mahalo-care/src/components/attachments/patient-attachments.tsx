import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, FileLock2, FileUp, RotateCw, ShieldAlert, X } from "lucide-react";
import {
  useListPatientAttachments, getListPatientAttachmentsQueryKey, useRequestPatientAttachmentUpload, useCompletePatientAttachment,
  getDownloadPatientAttachmentUrl, type PatientAttachment,
} from "@workspace/api-client-react";
import { Btn, EmptyState, ErrorState, Panel, SkeletonRows } from "@/components/kit";
import { errMsg, fmtDateTime } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AttachmentReviewDialog, type Decision } from "./attachment-review";

export const MAX_BYTES = 1048576;
const STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_upload: { label: "Awaiting upload", cls: "bg-muted text-muted-foreground border-border" },
  quarantined: { label: "Quarantined", cls: "bg-[hsl(38_95%_95%)] text-[hsl(30_80%_34%)] border-[hsl(38_80%_82%)]" },
  released_demo: { label: "Released (demo)", cls: "bg-accent text-accent-foreground border-primary/15" },
  rejected: { label: "Rejected", cls: "bg-[hsl(352_80%_97%)] text-[hsl(352_72%_36%)] border-[hsl(352_65%_86%)]" },
  revoked: { label: "Revoked", cls: "bg-[hsl(352_80%_97%)] text-[hsl(352_72%_36%)] border-[hsl(352_65%_86%)]" },
  canceled: { label: "Canceled", cls: "bg-muted text-muted-foreground border-border" },
};
const kb = (n: number) => (n < 1024 ? n + " B" : (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB");
// Generated URL helpers already include the /api prefix; prepend the app base path like the router does.
const appUrl = (path: string) => import.meta.env.BASE_URL.replace(/\/$/, "") + path;

type Stage = "idle" | "requesting" | "uploading" | "sealing";
type Pending = { file: File; uploadId: string; attachmentId?: string; stage: Stage; error?: string };

function validate(f: File): string | null {
  if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return "Only PDF files can be uploaded.";
  if (f.size === 0) return "This file is empty.";
  if (f.size > MAX_BYTES) return "This file is " + kb(f.size) + ". The limit is 1 MB (1,048,576 bytes).";
  return null;
}

/** Private supporting PDFs. Separate from signed clinical documents; never changes notes, signatures or billing. */
export function PatientAttachments({ patientId, audience }: { patientId: string; audience: "staff" | "patient" }) {
  const qc = useQueryClient();
  const key = getListPatientAttachmentsQueryKey(patientId);
  const list = useListPatientAttachments(patientId, { query: { queryKey: key } });
  const requestUpload = useRequestPatientAttachmentUpload();
  const complete = useCompletePatientAttachment();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [review, setReview] = useState<{ row: PatientAttachment; decision: Decision } | null>(null);
  const busy = !!pending && pending.stage !== "idle";
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const pick = (f?: File) => {
    if (!f) return;
    const err = validate(f);
    setPickError(err);
    if (!err) setPending({ file: f, uploadId: crypto.randomUUID(), stage: "idle" });
    if (input.current) input.current.value = "";
  };

  const upload = async () => {
    if (!pending || busy) return;
    const { file, uploadId } = pending;
    const step = (s: Partial<Pending>) => setPending((p) => (p ? { ...p, ...s } : p));
    try {
      step({ stage: "requesting", error: undefined });
      const ticket = await requestUpload.mutateAsync({ id: patientId, data: { uploadId, filename: file.name, sizeBytes: file.size, mimeType: "application/pdf" } });
      step({ attachmentId: ticket.attachmentId });
      if (!ticket.alreadyComplete) {
        if (!ticket.uploadURL) throw new Error("The server did not provide an upload location. Try again.");
        step({ stage: "uploading" });
        // Direct to private storage: no cookies or auth headers, raw bytes only.
        const put = await fetch(ticket.uploadURL, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file, credentials: "omit" });
        if (!put.ok) throw new Error("Storage rejected the upload (" + put.status + "). Your file is still selected; retry when ready.");
      }
      step({ stage: "sealing" });
      await complete.mutateAsync({ id: patientId, attachmentId: ticket.attachmentId });
      setPending(null);
    } catch (e) {
      step({ stage: "idle", error: e instanceof Error && !("status" in e) ? e.message : errMsg(e) });
    } finally {
      refresh();
    }
  };

  const rows = [...(list.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const stageText: Record<Stage, string> = { idle: "", requesting: "Preparing private upload…", uploading: "Sending file to private storage…", sealing: "Validating and sealing…" };

  return (
    <Panel
      title={<span className="flex items-center gap-2"><FileLock2 className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Supporting files</span>}
      sub={audience === "staff" ? "Private PDFs, quarantined on upload. Separate from signed clinical documents." : "Share a PDF with your care team. Files stay private and are held for review."}
      action={<Btn size="sm" onClick={() => input.current?.click()} disabled={busy} data-testid="button-pick-attachment"><FileUp className="h-3.5 w-3.5" strokeWidth={1.6} />Choose PDF</Btn>}
    >
      <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => pick(e.target.files?.[0])} data-testid="input-attachment-file" />
      {pickError && <p role="alert" className="mb-3 text-xs text-destructive">{pickError}</p>}

      {pending && (
        <div className="mb-4 rounded-xl border border-border bg-secondary/40 p-3" data-testid="pending-upload">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{pending.file.name}</span>
            <span className="tnum text-xs text-muted-foreground">{kb(pending.file.size)}</span>
          </div>
          {busy && <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">{stageText[pending.stage]}</p>}
          {pending.error && <div role="alert" className="mt-2 flex gap-2 rounded-md border border-destructive/25 bg-[hsl(352_80%_98.5%)] px-2.5 py-1.5 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />{pending.error}</div>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Btn size="sm" variant="primary" disabled={busy} onClick={upload} data-testid="button-upload-attachment">{pending.error ? <><RotateCw className="h-3.5 w-3.5" strokeWidth={1.6} />Retry upload</> : busy ? "Uploading…" : "Upload privately"}</Btn>
            <Btn size="sm" variant="ghost" disabled={busy} onClick={() => setPending(null)} data-testid="button-discard-selection"><X className="h-3.5 w-3.5" strokeWidth={1.6} />Remove selection</Btn>
          </div>
          {pending.attachmentId && !busy && <p className="mt-2 text-[11px] text-muted-foreground">An unfinished entry may appear below. Retry reuses it; cancel it there if you no longer need it.</p>}
        </div>
      )}

      {list.isLoading ? <SkeletonRows rows={3} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !rows.length ? (
        <EmptyState icon={<FileLock2 className="h-4 w-4" strokeWidth={1.6} />} title="No supporting files" desc="PDF only, up to 1 MB. Uploaded files are quarantined and cannot be downloaded until reviewed." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const st = STATUS[r.status] ?? { label: r.status, cls: "bg-muted text-muted-foreground border-border" };
            return (
              <li key={r.id} className="py-3" data-testid={"row-attachment-" + r.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" title={r.filename}>{r.filename}</span>
                  <span className={cn("inline-flex rounded-full border px-2 py-[1px] text-[11px] font-medium leading-5", st.cls)}>{st.label}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{kb(r.sizeBytes)} · uploaded by {r.uploadedBy} · {fmtDateTime(r.createdAt)}</div>
                {r.status === "quarantined" && <p className="mt-1 flex items-center gap-1 text-[11px] text-[hsl(30_80%_30%)]"><ShieldAlert className="h-3 w-3" strokeWidth={1.6} />Not scanned for malware. Held until an administrator reviews it.</p>}
                {r.status === "released_demo" && <p className="mt-1 text-[11px] text-muted-foreground">Released for this demo by attestation. Not malware-scanned or clinically reviewed.</p>}
                {r.validationError && <p className="mt-1 text-[11px] text-destructive">{r.validationError}</p>}
                {r.reviewedBy && <p className="mt-1 text-[11px] text-muted-foreground">{st.label} by {r.reviewedBy}{r.reviewedAt ? " · " + fmtDateTime(r.reviewedAt) : ""}{r.reviewReason ? ": " + r.reviewReason : ""}</p>}
                {r.sha256 && <details className="mt-1 text-[11px] text-muted-foreground"><summary className="cursor-pointer">SHA-256</summary><code className="mt-1 block break-all font-mono text-[10.5px]">{r.sha256}</code><span>Identifies these exact bytes; it is not a safety check.</span></details>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.canDownload && <a href={appUrl(getDownloadPatientAttachmentUrl(r.patientId, r.id))} className="inline-flex h-7 items-center gap-1 rounded-full border border-input px-3 text-xs font-medium hover:bg-secondary" data-testid={"link-download-attachment-" + r.id}><Download className="h-3.5 w-3.5" strokeWidth={1.6} />Download</a>}
                  {r.canReview && r.status === "quarantined" && <Btn size="sm" onClick={() => setReview({ row: r, decision: "release_demo" })} data-testid={"button-release-" + r.id}>Release for demo</Btn>}
                  {r.canReview && ["awaiting_upload", "quarantined"].includes(r.status) && <Btn size="sm" variant="danger" onClick={() => setReview({ row: r, decision: "reject" })} data-testid={"button-reject-attachment-" + r.id}>Reject</Btn>}
                  {r.canReview && r.status === "released_demo" && <Btn size="sm" variant="danger" onClick={() => setReview({ row: r, decision: "revoke" })} data-testid={"button-revoke-" + r.id}>Revoke</Btn>}
                  {r.canCancel && <Btn size="sm" variant="ghost" onClick={() => setReview({ row: r, decision: "cancel" })} data-testid={"button-cancel-attachment-" + r.id}>Cancel upload</Btn>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[10.5px] text-muted-foreground">Supporting files never change clinical notes, signatures or billing.</p>
      {review && <AttachmentReviewDialog row={review.row} decision={review.decision} onClose={() => setReview(null)} onChanged={refresh} />}
    </Panel>
  );
}
