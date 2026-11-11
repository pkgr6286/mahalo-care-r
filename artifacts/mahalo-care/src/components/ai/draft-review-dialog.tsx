import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ScanSearch } from "lucide-react";
import { useCheckAiDraftText, usePerformAction, type AiNumericCheck, type CareRecord } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Field, Pill, inputCls } from "@/components/kit";
import { useToast } from "@/hooks/use-toast";
import { errMsg, mArr, mStr } from "@/lib/api";
import { cn } from "@/lib/utils";

export function draftEffect(d: CareRecord) {
  const k = (mStr(d, "capability") || mStr(d, "action") || mStr(d, "draftType") || mStr(d, "type")).toLowerCase();
  if (k.includes("message")) return { label: "Review and send message", confirm: "Send message now", effect: "Sends this text to the patient's secure portal immediately. It cannot be unsent.", send: true };
  if (k.includes("time")) return { label: "Record review", confirm: "Record review", effect: "Records that you reviewed this time suggestion. No minutes are logged; record time separately.", send: false };
  if (k.includes("priorit")) return { label: "Record review", confirm: "Record review", effect: "Records that you reviewed this prioritization. No queue or clinical state changes.", send: false };
  return { label: "Review and create note", confirm: "Create unsigned note", effect: "Creates an unsigned draft note from the reviewed text. You still edit and sign it separately.", send: false };
}

function usePerform(onOk: () => void) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = usePerformAction();
  const [error, setError] = useState<string | null>(null);
  const go = (data: Parameters<typeof m.mutate>[0]["data"]) => {
    setError(null);
    m.mutate({ data }, {
      onSuccess: (r) => { qc.invalidateQueries(); if (r.success) { toast({ title: "Recorded", description: r.message }); onOk(); } else setError(r.message || "Not completed"); },
      onError: (e) => setError(errMsg(e)),
    });
  };
  return { go, pending: m.isPending, error };
}

const STATUS_TEXT: Record<string, string> = {
  checked: "All recognized numeric quantities match values frozen with the draft's sources.",
  no_numeric_claims: "No numeric quantities were recognized in this text.",
  needs_review: "Some numeric quantities do not match the frozen source values.",
  unavailable: "This draft has no frozen numeric evidence (older draft). Nothing could be checked; review every number against the chart yourself.",
};

export function DraftReviewDialog({ d, onClose }: { d: CareRecord; onClose: () => void }) {
  const fx = draftEffect(d);
  const original = d.description ?? "";
  const [text, setText] = useState(original);
  const [check, setCheck] = useState<{ text: string; r: AiNumericCheck } | null>(null);
  const [verified, setVerified] = useState<Set<string>>(() => new Set());
  const [overrideReason, setOverrideReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const checker = useCheckAiDraftText();
  const act = usePerform(onClose);

  const current = check && check.text === text ? check.r : null;
  const stale = !!check && check.text !== text;
  const unsupported = current?.unsupported ?? [];
  const allVerified = unsupported.length > 0 && unsupported.every((u) => verified.has(u.claim));
  const needsReason = unsupported.length > 0;
  const reasonOk = overrideReason.trim().length >= 20 && overrideReason.trim().length <= 2000;
  const blank = !text.trim() || text.length > 18000;
  const ready = !!current && !blank && confirmed && (!needsReason || (allVerified && reasonOk));

  const edit = (v: string) => { setText(v); setConfirmed(false); setVerified(new Set()); };
  const runCheck = () => checker.mutate({ id: d.id, data: { finalText: text } }, { onSuccess: (r) => { setCheck({ text, r }); setVerified(new Set()); }, onError: () => setCheck(null) });
  const jump = (claim: string) => { const el = area.current; if (!el) return; const i = text.indexOf(claim); el.focus(); if (i >= 0) el.setSelectionRange(i, i + claim.length); };
  const submit = () => act.go({ action: "acceptDraft", id: d.id, payload: { reviewConfirmed: true, ...(text !== original ? { finalText: text } : {}), ...(needsReason ? { numericOverrideReason: overrideReason.trim() } : {}) } });
  const frozen = d.metadata?.numericCheck as AiNumericCheck | undefined;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fx.label}</DialogTitle>
          <DialogDescription>{fx.effect}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>{mArr(d, "sourceIds").length} source records</span>
          {mStr(d, "promptVersion") && <span>Prompt {mStr(d, "promptVersion")}</span>}
          <span>{mStr(d, "provider") || "deterministic"}{mStr(d, "model") ? " · " + mStr(d, "model") : ""}</span>
          {frozen && <span>Original draft check: {frozen.status.replace(/_/g, " ")}</span>}
        </div>
        <Field label="Reviewed text" hint={text !== original ? "Edited. The generated original is kept unchanged." : "Unedited generated text."}>
          <textarea ref={area} className={cn(inputCls, "h-56 resize-y whitespace-pre-wrap py-2 text-sm")} value={text} maxLength={18000} onChange={(e) => edit(e.target.value)} data-testid="input-draft-final" />
        </Field>

        <section className="rounded-lg border border-border p-3" aria-live="polite" data-testid="panel-numeric-check">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">Numeric source check</span>
            {current && <Pill tone={current.status === "checked" || current.status === "no_numeric_claims" ? "green" : current.status === "needs_review" ? "amber" : "neutral"}>{current.status.replace(/_/g, " ")}</Pill>}
            {stale && <Pill tone="neutral">Text changed since last check</Pill>}
            <Btn size="sm" className="ml-auto" onClick={runCheck} disabled={checker.isPending || blank} data-testid="button-check-draft"><ScanSearch className="h-3.5 w-3.5" strokeWidth={1.6} />{checker.isPending ? "Checking…" : check ? "Recheck current text" : "Check current text"}</Btn>
          </div>
          {checker.isError && <p className="mt-1 text-xs text-destructive">{errMsg(checker.error)}</p>}
          {!current && !checker.isError && <p className="mt-1 text-[11px] text-muted-foreground">Required before {fx.send ? "sending" : "accepting"}. Compares number formats and values in this exact text with values frozen from the sources. No AI call.</p>}
          {current && (
            <div className="mt-1.5 space-y-1.5 text-xs">
              <p className={current.status === "unavailable" ? "text-[hsl(30_70%_28%)]" : "text-foreground/80"}>{STATUS_TEXT[current.status] ?? current.status}{current.recognizedClaims > 0 && " " + current.supportedClaims + " of " + current.recognizedClaims + " recognized quantities matched."}</p>
              {unsupported.length > 0 && (
                <ul className="space-y-1">
                  {unsupported.map((u) => (
                    <li key={u.claim} className="flex flex-wrap items-center gap-2 rounded-md bg-[hsl(38_95%_96%)] px-2 py-1">
                      <span className="font-mono">{u.claim}</span><span className="text-muted-foreground">{u.reason}</span>
                      <button type="button" className="ml-auto text-primary hover:underline" onClick={() => jump(u.claim)}>Edit</button>
                      <label className="flex items-center gap-1"><input type="checkbox" className="accent-[hsl(var(--primary))]" checked={verified.has(u.claim)} onChange={(e) => setVerified((s) => { const n = new Set(s); if (e.target.checked) n.add(u.claim); else n.delete(u.claim); return n; })} />I verified this</label>
                    </li>
                  ))}
                </ul>
              )}
              {needsReason && (
                <Field label="Why these quantities are correct" hint={allVerified ? overrideReason.trim().length + " / 20 characters minimum. Recorded as your exception, not machine-validated." : "Edit and recheck, or mark each quantity verified to record an exception."}>
                  <textarea className={cn(inputCls, "h-20 resize-y py-2")} maxLength={2000} disabled={!allVerified} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} data-testid="input-numeric-override" />
                </Field>
              )}
              <p className="text-[10.5px] text-muted-foreground">Scope: {current.scope}. Format and value matching only; not clinical validation, diagnosis verification or a safety check.</p>
            </div>
          )}
        </section>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-[hsl(var(--primary))]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="check-draft-reviewed" />
          <span>I reviewed this text against the chart and it is ready to {fx.send ? "send to the patient" : "use as described above"}.</span>
        </label>
        {act.error && <div role="alert" className="flex gap-2 rounded-lg border border-destructive/25 bg-[hsl(352_80%_98.5%)] px-3 py-2 text-xs text-destructive" data-testid="alert-draft-error"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6} /><span>{act.error} Your text is unchanged here.</span></div>}
        <DialogFooter>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!ready || act.pending} onClick={submit} data-testid="button-confirm-accept-draft">{act.pending ? "Working…" : fx.confirm}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RejectDraftDialog({ d, onClose }: { d: CareRecord; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const act = usePerform(onClose);
  const ok = reason.trim().length >= 5 && reason.trim().length <= 2000;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reject draft</DialogTitle><DialogDescription>Final. The draft and your reason are kept for audit; nothing is filed or sent.</DialogDescription></DialogHeader>
        <Field label="Reason" hint={reason.trim().length + " / 5 characters minimum"}><textarea className={cn(inputCls, "h-24 resize-y py-2")} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-reject-reason" /></Field>
        {act.error && <p role="alert" className="text-xs text-destructive">{act.error}</p>}
        <DialogFooter>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="danger" disabled={!ok || act.pending} onClick={() => act.go({ action: "rejectDraft", id: d.id, reason: reason.trim() })} data-testid="button-confirm-reject-draft">{act.pending ? "Rejecting…" : "Reject draft"}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
