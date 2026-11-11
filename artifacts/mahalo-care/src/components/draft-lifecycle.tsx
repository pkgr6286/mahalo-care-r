import { useState } from "react";
import { ArchiveX, ArchiveRestore } from "lucide-react";
import type { CareRecord } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Field, inputCls } from "@/components/kit";
import { usePermission } from "@/components/access";
import { useAction } from "@/lib/api";
import { DISCARD_DRAFT, RESTORE_DRAFT, isDiscardedDraft } from "@/lib/record-lifecycle";
import { cn } from "@/lib/utils";

/** Discard (draft -> cancelled) or restore (cancelled -> draft) for notes and care plans. Content, history and audit are kept. */
export function DraftLifecycle({ r }: { r: CareRecord }) {
  const { allow } = usePermission();
  const [mode, setMode] = useState<"discard" | "restore" | null>(null);
  const [reason, setReason] = useState("");
  const { run, pending } = useAction();
  if (!allow("clinical.write") || (r.kind !== "notes" && r.kind !== "careplans")) return null;
  const can = r.status === "draft" ? "discard" : isDiscardedDraft(r) ? "restore" : null;
  if (!can) return null;
  const noun = r.kind === "notes" ? "note" : "care plan";
  const ok = reason.trim().length >= 5 && reason.trim().length <= 2000;
  const close = () => { setMode(null); setReason(""); };
  return (
    <>
      {can === "discard"
        ? <Btn size="sm" variant="ghost" onClick={() => setMode("discard")} data-testid={"button-discard-" + r.id}><ArchiveX className="h-3.5 w-3.5" strokeWidth={1.6} />Discard</Btn>
        : <Btn size="sm" onClick={() => setMode("restore")} data-testid={"button-restore-" + r.id}><ArchiveRestore className="h-3.5 w-3.5" strokeWidth={1.6} />Restore draft</Btn>}
      <Dialog open={!!mode} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "discard" ? "Discard draft " + noun : "Restore draft " + noun}</DialogTitle>
            <DialogDescription>{mode === "discard" ? "The draft is marked cancelled and leaves worklists. Its content, earlier signed versions and audit trail are kept, and it can be restored." : "Returns this " + noun + " to draft so it can be edited and signed again."}</DialogDescription>
          </DialogHeader>
          <Field label="Reason" hint={reason.trim().length + " / 5 characters minimum"}>
            <textarea className={cn(inputCls, "h-24 resize-y py-2")} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-draft-reason" />
          </Field>
          <DialogFooter>
            <Btn variant="ghost" onClick={close}>Cancel</Btn>
            <Btn variant={mode === "discard" ? "danger" : "primary"} disabled={!ok || pending} onClick={() => run({ action: mode === "discard" ? DISCARD_DRAFT : RESTORE_DRAFT, id: r.id, reason: reason.trim() }, close)} data-testid="button-confirm-draft-lifecycle">{pending ? "Saving…" : mode === "discard" ? "Discard draft" : "Restore draft"}</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ConflictNotice() {
  return (
    <div role="alert" className="rounded-lg border border-destructive/25 bg-[hsl(352_80%_98.5%)] px-3 py-2 text-xs text-destructive" data-testid="alert-edit-conflict">
      <div className="font-medium">Someone changed this record after you opened it.</div>
      <div className="mt-0.5 text-foreground/80">Nothing was overwritten and your text is still here. Copy what you need, close this editor, reopen the latest version, then reapply your changes.</div>
    </div>
  );
}
