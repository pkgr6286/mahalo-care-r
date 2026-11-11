import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, BadgeCheck, Copy, Send } from "lucide-react";
import {
  getGetProgramPolicyQueryKey, getListProgramPoliciesQueryKey, useCloneProgramPolicy, usePublishProgramPolicy, useRetireProgramPolicy, useReviewProgramPolicy,
  type ProgramPolicy,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Field, inputCls } from "@/components/kit";
import { cn } from "@/lib/utils";
import { policyErrors, suggestVersion, today } from "@/lib/policy";
import { ErrorList } from "./validation-result";

function useRefresh() {
  const qc = useQueryClient();
  return (p: ProgramPolicy) => {
    qc.invalidateQueries({ queryKey: getListProgramPoliciesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetProgramPolicyQueryKey(p.id) });
  };
}

function ActionDialog({ trigger, title, desc, children, confirm, canConfirm, pending, errors, onConfirm, onOpen, testid, variant = "secondary" }: {
  trigger: ReactNode; title: string; desc: string; children: ReactNode; confirm: string; canConfirm: boolean; pending: boolean; errors: string[];
  onConfirm: (close: () => void) => void; onOpen?: () => void; testid: string; variant?: "secondary" | "primary" | "danger";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn size="sm" variant={variant} onClick={() => { onOpen?.(); setOpen(true); }} data-testid={testid}>{trigger}</Btn>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{desc}</DialogDescription></DialogHeader>
          <div className="space-y-3">{children}<ErrorList errors={errors} /></div>
          <DialogFooter>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" disabled={!canConfirm || pending} onClick={() => onConfirm(() => setOpen(false))} data-testid={`${testid}-confirm`}>{pending ? "Working…" : confirm}</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const Count = ({ n, min }: { n: number; min: number }) => <span className={cn("tnum", n >= min ? "text-[hsl(152_45%_32%)]" : "")}>{n} / {min} characters minimum</span>;

export function ReviewAction({ p }: { p: ProgramPolicy }) {
  const refresh = useRefresh();
  const m = useReviewProgramPolicy();
  const [note, setNote] = useState(""); const [src, setSrc] = useState(p.sourceRef ?? ""); const [att, setAtt] = useState(false); const [errs, setErrs] = useState<string[]>([]);
  const ok = note.trim().length >= 20 && src.trim().length > 0 && att;
  return (
    <ActionDialog
      testid="button-review" variant="primary" trigger={<><BadgeCheck className="h-3.5 w-3.5" />Review</>}
      title={`Review ${p.version}`} desc="Reviewing freezes this body and fingerprint. It can then be published by an administrator. This is a practice attestation, not regulatory approval."
      confirm="Record review" canConfirm={ok} pending={m.isPending} errors={errs}
      onOpen={() => { setNote(""); setSrc(p.sourceRef ?? ""); setAtt(false); setErrs([]); }}
      onConfirm={(close) => m.mutate({ policyId: p.id, data: { note: note.trim(), sourceRef: src.trim(), attested: true } }, { onSuccess: (r) => { refresh(r); close(); }, onError: (e) => setErrs(policyErrors(e)) })}
    >
      <Field label="Review note" hint="What you checked and against what."><textarea className={cn(inputCls, "h-24 py-2")} value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-review-note" /></Field>
      <div className="-mt-2 text-[11px] text-muted-foreground"><Count n={note.trim().length} min={20} /></div>
      <Field label="Source reference"><input className={inputCls} value={src} onChange={(e) => setSrc(e.target.value)} data-testid="input-review-source" /></Field>
      <label className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand-orange))]" checked={att} onChange={(e) => setAtt(e.target.checked)} data-testid="check-attest" />
        <span>I personally compared this body against the source reference above and accept it as a provisional practice policy. I understand it remains subject to verification and does not carry CMS or payer authority.</span>
      </label>
    </ActionDialog>
  );
}

function ReasonAction({ p, kind }: { p: ProgramPolicy; kind: "publish" | "retire" }) {
  const refresh = useRefresh();
  const pub = usePublishProgramPolicy(); const ret = useRetireProgramPolicy();
  const m = kind === "publish" ? pub : ret;
  const [reason, setReason] = useState(""); const [errs, setErrs] = useState<string[]>([]);
  const isRule = p.kind === "rulepack" || p.kind === "payer_override";
  const desc = kind === "publish"
    ? isRule ? "Applies to new enrollments only. Existing enrollments stay pinned to the version they started with." : "Becomes selectable for new enrollments and notes. Existing records keep the version they used."
    : "Stops offering this version for new work. Enrollments and records that already use it keep it for history.";
  return (
    <ActionDialog
      testid={`button-${kind}`} variant={kind === "publish" ? "primary" : "danger"}
      trigger={kind === "publish" ? <><Send className="h-3.5 w-3.5" />Publish</> : <><Archive className="h-3.5 w-3.5" />Retire</>}
      title={`${kind === "publish" ? "Publish" : "Retire"} ${p.version}`} desc={desc}
      confirm={kind === "publish" ? "Publish" : "Retire"} canConfirm={reason.trim().length >= 10} pending={m.isPending} errors={errs}
      onOpen={() => { setReason(""); setErrs([]); }}
      onConfirm={(close) => m.mutate({ policyId: p.id, data: { reason: reason.trim() } }, { onSuccess: (r) => { refresh(r); close(); }, onError: (e) => setErrs(policyErrors(e)) })}
    >
      <Field label="Reason"><textarea className={cn(inputCls, "h-20 py-2")} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-reason" /></Field>
      <div className="-mt-2 text-[11px] text-muted-foreground"><Count n={reason.trim().length} min={10} /></div>
    </ActionDialog>
  );
}
export const PublishAction = ({ p }: { p: ProgramPolicy }) => <ReasonAction p={p} kind="publish" />;
export const RetireAction = ({ p }: { p: ProgramPolicy }) => <ReasonAction p={p} kind="retire" />;

export function CloneAction({ p, onCloned }: { p: ProgramPolicy; onCloned: (n: ProgramPolicy) => void }) {
  const refresh = useRefresh();
  const m = useCloneProgramPolicy();
  const [version, setVersion] = useState(""); const [eff, setEff] = useState(today()); const [errs, setErrs] = useState<string[]>([]);
  return (
    <ActionDialog
      testid="button-clone" trigger={<><Copy className="h-3.5 w-3.5" />Clone to draft</>}
      title={`Clone ${p.version}`} desc="Creates a new editable draft from this body. The original stays unchanged."
      confirm="Create draft" canConfirm={!!version.trim() && /^\d{4}-\d{2}-\d{2}$/.test(eff)} pending={m.isPending} errors={errs}
      onOpen={() => { setVersion(suggestVersion(p.version)); setEff(today()); setErrs([]); }}
      onConfirm={(close) => m.mutate({ policyId: p.id, data: { version: version.trim(), effectiveFrom: eff } }, { onSuccess: (r) => { refresh(r); close(); onCloned(r); }, onError: (e) => setErrs(policyErrors(e)) })}
    >
      <Field label="New version"><input className={cn(inputCls, "font-mono")} value={version} onChange={(e) => setVersion(e.target.value)} data-testid="input-clone-version" /></Field>
      <Field label="Effective from"><input type="date" className={inputCls} value={eff} onChange={(e) => setEff(e.target.value)} data-testid="input-clone-effective" /></Field>
    </ActionDialog>
  );
}
