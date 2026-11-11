import { useState } from "react";
import { Check, CircleSlash } from "lucide-react";
import { useListRecords, getListRecordsQueryKey, type CareRecord } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Field, inputCls } from "@/components/kit";
import { fmtDate, useAction } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RESOLUTION_CODES } from "@/lib/rule-schema";

/** Resolve or dismiss an exception with a structured resolution code, reason and optional signed note. */
export function ExceptionCloseButton({ r, mode }: { r: CareRecord; mode: "resolve" | "dismiss" }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [noteId, setNoteId] = useState("");
  const { run, pending } = useAction();
  const notes = useListRecords("notes", { query: { enabled: open && !!r.patientId, queryKey: getListRecordsQueryKey("notes") } });
  const signed = (notes.data ?? []).filter((n) => n.patientId === r.patientId && n.status === "signed").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const critical = (r.severity ?? "").toLowerCase() === "critical";
  const ok = !!code && reason.trim().length >= 5;
  const reset = () => { setCode(""); setReason(""); setNoteId(""); };
  const resolve = mode === "resolve";
  return (
    <>
      {resolve
        ? <Btn size="sm" variant="primary" onClick={() => { reset(); setOpen(true); }} data-testid={`button-resolve-${r.id}`}><Check className="h-3.5 w-3.5" />Resolve</Btn>
        : <Btn size="sm" variant="ghost" onClick={() => { reset(); setOpen(true); }} aria-label={`Dismiss ${r.title}`} title="Dismiss" data-testid={`button-dismiss-${r.id}`}><CircleSlash className="h-3.5 w-3.5" /></Btn>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{resolve ? "Resolve exception" : "Dismiss exception"}</DialogTitle>
            <DialogDescription>{r.title}{r.patientName ? ` · ${r.patientName}` : ""}. {resolve ? "Records the clinical response in the patient's timeline." : "Dismissed exceptions stay in the audit trail with your reason."}{critical && !resolve ? " This is a critical exception; a specific reason is required." : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-foreground/80">Resolution code</legend>
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup">
                {RESOLUTION_CODES.map((c) => (
                  <label key={c.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors", code === c.id ? "border-[hsl(var(--brand-orange))] bg-secondary" : "border-border hover:bg-secondary/50")}>
                    <input type="radio" name={`code-${r.id}`} value={c.id} checked={code === c.id} onChange={() => setCode(c.id)} className="accent-[hsl(var(--brand-orange))]" data-testid={`radio-resolution-${c.id}`} />{c.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label={resolve ? "Resolution note" : "Reason for dismissal"} hint={`${reason.trim().length} / 5 characters minimum`}>
              <textarea className={cn(inputCls, "h-20 py-2")} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-reason" />
            </Field>
            {r.patientId && (
              <Field label="Link a signed note (optional)" hint="Only signed notes for this patient. The server re-checks the link.">
                <select className={inputCls} value={noteId} onChange={(e) => setNoteId(e.target.value)} disabled={notes.isLoading} data-testid="select-linked-note">
                  <option value="">{notes.isLoading ? "Loading notes…" : notes.isError ? "Notes unavailable" : signed.length ? "No linked note" : "No signed notes for this patient"}</option>
                  {signed.map((n) => <option key={n.id} value={n.id}>{n.title} · {fmtDate(n.date ?? n.createdAt)}</option>)}
                </select>
              </Field>
            )}
          </div>
          <DialogFooter>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" disabled={!ok || pending} onClick={() => run({ action: mode, id: r.id, reason: reason.trim(), payload: { resolutionCode: code, ...(noteId ? { linkedNoteId: noteId } : {}) } }, () => setOpen(false))} data-testid="button-confirm">{pending ? "Working…" : resolve ? "Resolve" : "Dismiss"}</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
