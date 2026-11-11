import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useIsMutating, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Clock, ShieldAlert, X } from "lucide-react";
import { endEmergencyAccess, getGetCurrentUserQueryKey, startEmergencyAccess, type User } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Field, inputCls } from "@/components/kit";
import { announceContextChange } from "@/lib/context-sync";
import { errMsg, fmtDateTime } from "@/lib/api";
import { cn } from "@/lib/utils";

export const emergencyOf = (u?: User | null) => u?.emergencyContext ?? null;
export const canStartEmergency = (u?: User | null) => u?.canUseEmergencyAccess === true && !emergencyOf(u);

const meKey = getGetCurrentUserQueryKey();
const isMe = (k: readonly unknown[]) => JSON.stringify(k) === JSON.stringify(meKey);
/** Drop every cached query except the signed-in user, so no chart from the old context can render. */
export async function purgeContext(qc: QueryClient, next?: User) {
  await qc.cancelQueries({ predicate: (q) => !isMe(q.queryKey) });
  qc.removeQueries({ predicate: (q) => !isMe(q.queryKey) });
  if (next) qc.setQueryData(meKey, next);
}

const left = (iso: string, now: number) => {
  const ms = Date.parse(iso) - now;
  if (!(ms > 0)) return "expired";
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${m} min left`;
};

/* ---------------- Start action (sidebar) ---------------- */
export function EmergencyAccessAction({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  if (!canStartEmergency(user)) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-dashed border-destructive/35 px-3 py-2 text-left text-[12.5px] text-destructive/90 transition-colors hover:bg-destructive/5" data-testid="button-emergency-access">
        <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={1.6} />
        <span className="min-w-0"><span className="block font-medium">Emergency access</span><span className="block text-[11px] text-muted-foreground">Read one chart outside your sites</span></span>
      </button>
      {open && <StartDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function StartDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const busy = useIsMutating() > 0;
  const [mrn, setMrn] = useState("");
  const [reason, setReason] = useState("");
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = reason.trim();
  const start = useMutation({
    mutationFn: () => startEmergencyAccess({ mrn: mrn.trim(), reason: r, attested: true }),
    onSuccess: async (u) => {
      await purgeContext(qc, u);
      announceContextChange(u.id);
      const ctx = emergencyOf(u);
      onClose();
      setLocation(ctx ? `/patients/${encodeURIComponent(ctx.patientId)}` : "/");
    },
    onError: (e) => setError(errMsg(e)),
  });
  const valid = !!mrn.trim() && r.length >= 20 && r.length <= 1000 && attested;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !start.isPending) onClose(); }}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-destructive" strokeWidth={1.7} />Emergency read-only access</DialogTitle>
          <DialogDescription>For urgent care of a patient outside your assigned sites.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <li><span className="font-medium text-foreground">Read only.</span> You can view the chart but cannot edit, sign, message, bill or track time.</li>
          <li><span className="font-medium text-foreground">One patient.</span> Only the exact MRN you enter. Nothing else at that site opens.</li>
          <li><span className="font-medium text-foreground">Ends within 4 hours</span>, or sooner if you end it.</li>
          <li><span className="font-medium text-foreground">Audited.</span> Your identity, the reason and every view are recorded for compliance review.</li>
        </ul>
        <p className="text-[11px] text-muted-foreground">This changes your whole signed-in session, including other open tabs. Save or close drafts in all tabs first; nothing is saved or discarded for you. Running tracked time must be finished before access starts.</p>
        <Field label="Patient MRN" hint="Exact medical record number. No search is available.">
          <input className={cn(inputCls, "font-mono")} value={mrn} maxLength={64} autoComplete="off" spellCheck={false} onChange={(e) => { setMrn(e.target.value); setError(null); }} data-testid="input-emergency-mrn" />
        </Field>
        <Field label="Clinical reason" hint={`${r.length} / 20–1000 characters`}>
          <textarea className={cn(inputCls, "h-24 resize-y py-2", r.length > 1000 && "border-destructive")} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} placeholder="Why you need this chart now, and your role in the patient's care" data-testid="input-emergency-reason" />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={attested} onChange={(e) => setAttested(e.target.checked)} data-testid="check-emergency-attest" />
          <span>I need this record for a patient's urgent care, and I understand this access is logged and reviewed.</span>
        </label>
        {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive" data-testid="text-emergency-error">{error}</p>}
        <DialogFooter>
          <Btn variant="ghost" onClick={onClose} disabled={start.isPending}>Cancel</Btn>
          <Btn variant="danger" disabled={!valid || start.isPending || busy} onClick={() => { setError(null); start.mutate(); }} data-testid="button-start-emergency">{start.isPending ? "Opening…" : "Start emergency access"}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Banner + expiry watchdog ---------------- */
export function EmergencyBanner({ user, className }: { user: User; className?: string }) {
  const ctx = emergencyOf(user);
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const busy = useIsMutating() > 0;
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prev = useRef<string | null>(ctx?.patientId ?? null);

  // Context gone (ended elsewhere, expired server-side, or fresh /me): purge and go home.
  useEffect(() => {
    const had = prev.current;
    prev.current = ctx?.patientId ?? null;
    if (had && !ctx) { void purgeContext(qc, user); setLocation("/"); }
  }, [ctx, qc, user, setLocation]);

  // Local expiry: purge even if offline or idle, then refetch /me.
  const expiresAt = ctx?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const expire = () => {
      qc.cancelQueries({ predicate: (q) => !isMe(q.queryKey) });
      qc.removeQueries({ predicate: (q) => !isMe(q.queryKey) });
      qc.setQueryData<User>(meKey, (old) => (old ? { ...old, emergencyContext: null } : old));
      prev.current = null;
      setLocation("/");
      void qc.invalidateQueries({ queryKey: meKey });
    };
    const ms = Date.parse(expiresAt) - Date.now();
    if (!(ms > 0)) { expire(); return; }
    const t = window.setTimeout(expire, Math.min(ms, 2 ** 31 - 1));
    const tick = window.setInterval(() => { setNow(Date.now()); if (Date.parse(expiresAt) <= Date.now()) expire(); }, 15000);
    const onVis = () => { if (Date.parse(expiresAt) <= Date.now()) expire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearTimeout(t); window.clearInterval(tick); document.removeEventListener("visibilitychange", onVis); };
  }, [expiresAt, qc, setLocation]);

  const end = useMutation({
    mutationFn: () => endEmergencyAccess(),
    onSuccess: async (u) => { prev.current = null; await purgeContext(qc, u); announceContextChange(u.id); setConfirm(false); setLocation("/"); },
    onError: (e) => setError(errMsg(e)),
  });

  if (!ctx) return null;
  const soon = Date.parse(ctx.expiresAt) - now < 15 * 60000;
  return (
    <div role="status" aria-live="polite" className={cn("border-b-2 border-destructive bg-[hsl(356_70%_96%)] px-4 py-2 text-[hsl(356_60%_26%)]", className)} data-testid="banner-emergency">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.1em] text-[11px]"><ShieldAlert className="h-4 w-4" strokeWidth={1.8} />Emergency read-only</span>
        <span className="min-w-0 truncate"><span className="font-medium" data-testid="text-emergency-patient">{ctx.patientName}</span> <span className="font-mono text-xs">MRN {ctx.mrn}</span> <span className="text-xs opacity-80">· {ctx.location}</span></span>
        <span className={cn("inline-flex items-center gap-1 text-xs tnum", soon && "font-semibold")} title={`Ends ${fmtDateTime(ctx.expiresAt)}`} data-testid="text-emergency-expiry"><Clock className="h-3.5 w-3.5" strokeWidth={1.7} />Ends {fmtDateTime(ctx.expiresAt)} · {left(ctx.expiresAt, now)}</span>
        <span className="hidden text-xs opacity-80 lg:inline">Viewing is audited. No changes can be made.</span>
        <Btn size="sm" variant="secondary" className="ml-auto" disabled={end.isPending || busy} onClick={() => { setError(null); setConfirm(true); }} data-testid="button-end-emergency"><X className="h-3.5 w-3.5" />End access</Btn>
      </div>
      <Dialog open={confirm} onOpenChange={(o) => { if (!o && !end.isPending) setConfirm(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>End emergency access?</DialogTitle><DialogDescription>Your normal role and sites are restored immediately, and the chart for {ctx.patientName} closes. Opening it again requires a new reason.</DialogDescription></DialogHeader>
          <p className="text-xs text-muted-foreground">Applies to your whole signed-in session, including other open tabs.</p>
          {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive" data-testid="text-emergency-end-error">{error}</p>}
          <DialogFooter>
            <Btn variant="ghost" onClick={() => setConfirm(false)} disabled={end.isPending}>Keep open</Btn>
            <Btn variant="primary" disabled={end.isPending} onClick={() => end.mutate()} data-testid="button-confirm-end-emergency">{end.isPending ? "Ending…" : "End access"}</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
