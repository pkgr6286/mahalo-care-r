import { useState } from "react";
import { useReviewPatientAttachment, type PatientAttachment } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Field, inputCls } from "@/components/kit";
import { errMsg } from "@/lib/api";
import { cn } from "@/lib/utils";

export type Decision = "release_demo" | "reject" | "revoke" | "cancel";
const COPY: Record<Decision, { t: string; d: string; b: string; danger: boolean }> = {
  release_demo: { t: "Release for demo use", d: "Makes this file downloadable to permitted users. No malware scan has been run, and release is not a clinical or safety approval.", b: "Release for demo", danger: false },
  reject: { t: "Reject file", d: "The file stays private and can never be downloaded. The record and your reason are kept.", b: "Reject", danger: true },
  revoke: { t: "Revoke release", d: "Stops all further downloads. Copies already downloaded cannot be recalled.", b: "Revoke", danger: true },
  cancel: { t: "Cancel upload", d: "Withdraws this file. It will not be reviewed or downloadable.", b: "Cancel upload", danger: true },
};
const isStatus = (e: unknown, n: number) => !!e && typeof e === "object" && "status" in e && (e as { status: number }).status === n;

export function AttachmentReviewDialog({ row, decision, onClose, onChanged }: { row: PatientAttachment; decision: Decision; onClose: () => void; onChanged: () => void }) {
  const m = useReviewPatientAttachment();
  const [reason, setReason] = useState("");
  const [synthetic, setSynthetic] = useState(false);
  const [unscanned, setUnscanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = COPY[decision];
  const release = decision === "release_demo";
  const ok = reason.trim().length >= 20 && reason.trim().length <= 2000 && (!release || (synthetic && unscanned));

  const submit = () => {
    if (!ok || m.isPending) return;
    setError(null);
    m.mutate({ id: row.patientId, attachmentId: row.id, data: { decision, reason: reason.trim(), expectedUpdatedAt: row.updatedAt, ...(release ? { syntheticSourceConfirmed: true, unscannedRiskAcknowledged: true } : {}) } }, {
      onSuccess: () => { onChanged(); onClose(); },
      onError: (e) => {
        onChanged();
        if (isStatus(e, 409)) { setSynthetic(false); setUnscanned(false); setError("This file changed since you opened it, so nothing was applied. The list has been refreshed; check its current state before trying again."); }
        else setError(errMsg(e));
      },
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !m.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{c.t}</DialogTitle><DialogDescription>{c.d}</DialogDescription></DialogHeader>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"><div className="truncate font-medium">{row.filename}</div>{row.sha256 && <code className="mt-0.5 block break-all font-mono text-[10px] text-muted-foreground">{row.sha256}</code>}</div>
        <Field label="Reason" hint={reason.trim().length + " / 20 characters minimum"}>
          <textarea className={cn(inputCls, "h-24 resize-y py-2")} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-attachment-reason" />
        </Field>
        {release && (
          <div className="space-y-2 text-sm">
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={synthetic} onChange={(e) => setSynthetic(e.target.checked)} data-testid="check-attachment-synthetic" /><span>I know this file comes from a synthetic or otherwise trusted source.</span></label>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={unscanned} onChange={(e) => setUnscanned(e.target.checked)} data-testid="check-attachment-unscanned" /><span>I understand no malware scan has been run on this file.</span></label>
          </div>
        )}
        {error && <p role="alert" className="text-xs text-destructive" data-testid="alert-attachment-review">{error}</p>}
        <DialogFooter>
          <Btn variant="ghost" disabled={m.isPending} onClick={onClose}>Close</Btn>
          <Btn variant={c.danger ? "danger" : "primary"} disabled={!ok || m.isPending} onClick={submit} data-testid="button-confirm-attachment-review">{m.isPending ? "Saving…" : c.b}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
