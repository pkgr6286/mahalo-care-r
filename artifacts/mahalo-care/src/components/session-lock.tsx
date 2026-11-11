import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, LogOut } from "lucide-react";
import { getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { Btn, inputCls } from "@/components/kit";
import { Logo } from "@/components/brand";
import {apiUrl as api,sessionMutationHeaders} from "@/lib/http";

/* Staff inactivity lock. The server is the authority (423 SESSION_LOCKED, me.sessionLocked);
   the client also locks after 15 minutes without trusted input so screens are covered promptly.
   While locked all queries and mutations are paused (onlineManager) so nothing polls in the background,
   and the page underneath stays mounted so unsaved drafts survive. */
const IDLE_MS = 15 * 60_000;
const ACTIVITY_THROTTLE_MS = 45_000;

let locked = false;
const subs = new Set<() => void>();
export function setSessionLocked(v: boolean) {
  if (locked === v) return;
  locked = v;
  onlineManager.setOnline(!v);
  subs.forEach((f) => f());
}
export const useSessionLocked = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => locked);

export function isSessionLockedError(e: unknown) {
  if (!e || typeof e !== "object" || !("status" in e) || (e as { status: number }).status !== 423) return false;
  const data = (e as { data?: { code?: string } }).data;
  return !data?.code || data.code === "SESSION_LOCKED";
}

export function SessionLockGuard({ enabled, serverLocked, onSignOut }: { enabled: boolean; serverLocked: boolean; onSignOut: () => void }) {
  const isLocked = useSessionLocked();
  const lastInput = useRef(Date.now());
  const lastPing = useRef(0);

  useEffect(() => { if (enabled && serverLocked) setSessionLocked(true); }, [enabled, serverLocked]);
  useEffect(() => () => setSessionLocked(false), []);

  useEffect(() => {
    if (!enabled) return;
    const onInput = (e: Event) => {
      if (!e.isTrusted || locked) return;
      lastInput.current = Date.now();
      if (Date.now() - lastPing.current < ACTIVITY_THROTTLE_MS) return;
      lastPing.current = Date.now();
      fetch(api("/auth/activity"), { method: "POST", credentials: "include", headers: sessionMutationHeaders(), body: "{}" })
        .then((r) => { if (r.status === 423) setSessionLocked(true); })
        .catch(() => undefined);
    };
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((ev) => window.addEventListener(ev, onInput, { capture: true, passive: true }));
    const t = setInterval(() => { if (!locked && Date.now() - lastInput.current >= IDLE_MS) setSessionLocked(true); }, 15_000);
    return () => { evs.forEach((ev) => window.removeEventListener(ev, onInput, { capture: true })); clearInterval(t); };
  }, [enabled]);

  if (!enabled || !isLocked) return null;
  return <LockOverlay onSignOut={onSignOut} onUnlocked={() => { lastInput.current = Date.now(); lastPing.current = Date.now(); }} />;
}

function LockOverlay({ onSignOut, onUnlocked }: { onSignOut: () => void; onUnlocked: () => void }) {
  const qc = useQueryClient();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(api("/auth/unlock"), { method: "POST", credentials: "include", headers: sessionMutationHeaders(), body: JSON.stringify({ password: pw }) });
      let body: { ok?: boolean; error?: string } = {};
      try { body = await r.json(); } catch { /* empty */ }
      if (r.status === 401 && !body.error) { onSignOut(); return; }
      if (!r.ok || !body.ok) throw new Error(body.error ?? (r.status === 429 ? "Too many attempts. Wait a moment and try again." : "That password didn't match."));
      setPw("");
      onUnlocked();
      setSessionLocked(false);
      qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not unlock.");
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[hsl(var(--background)/0.72)] p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="lock-title" data-testid="overlay-session-lock">
      <form onSubmit={submit} className="rise w-full max-w-sm rounded-2xl border border-card-border bg-card p-7 shadow-[var(--shadow)]">
        <Logo height={22} />
        <div className="mt-6 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary text-[hsl(var(--brand-orange))]"><Lock className="h-4 w-4" strokeWidth={1.6} /></div>
        <h1 id="lock-title" className="mt-3 text-xl font-semibold tracking-tight">Session locked</h1>
        <p className="mt-1 text-sm text-muted-foreground">Locked after 15 minutes without activity. Enter your password to continue. Anything you were typing is still on the page.</p>
        <label htmlFor="lock-password" className="mt-5 block text-xs font-medium">Password</label>
        <input id="lock-password" type="password" autoComplete="current-password" autoFocus className={`${inputCls} mt-1`} value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!err} data-testid="input-unlock-password" />
        {err && <p role="alert" className="mt-2 text-xs text-destructive" data-testid="text-unlock-error">{err}</p>}
        <Btn type="submit" variant="primary" className="mt-4 w-full" disabled={busy || !pw} data-testid="button-unlock">{busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Unlocking</> : "Unlock"}</Btn>
        <button type="button" onClick={onSignOut} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" data-testid="button-lock-signout"><LogOut className="h-3.5 w-3.5" strokeWidth={1.6} />Sign out instead</button>
      </form>
    </div>
  );
}
