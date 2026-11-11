import { useState } from "react";
import { useLocation } from "wouter";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, MapPin } from "lucide-react";
import { getGetCurrentUserQueryKey, switchStaffLocation, type User } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn } from "@/components/kit";
import { errMsg } from "@/lib/api";
import { roleLabel } from "@/pages/account";
import { cn } from "@/lib/utils";
import { announceContextChange } from "@/lib/context-sync";

export const siteRolesOf = (u?: User | null): Record<string, string> => ({ ...(u?.siteRoles ?? {}) });
export const hasSiteRoles = (u?: User | null) => Object.keys(siteRolesOf(u)).length > 0;

/** Current site + role chooser for accounts with per-location roles. Never offers "all locations". */
export function LocationContextSwitcher({ user }: { user: User }) {
  const map = siteRolesOf(user);
  const sites = Object.keys(map).sort((a, b) => a.localeCompare(b));
  const active = user.activeLocation ?? null;
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const busyElsewhere = useIsMutating() > 0;
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meKey = getGetCurrentUserQueryKey();
  const sw = useMutation({
    mutationFn: (location: string) => switchStaffLocation({ location }),
    onSuccess: async (u) => {
      const isMe = (k: readonly unknown[]) => JSON.stringify(k) === JSON.stringify(meKey);
      await qc.cancelQueries({ predicate: (q) => !isMe(q.queryKey) });
      qc.removeQueries({ predicate: (q) => !isMe(q.queryKey) });
      qc.setQueryData(meKey, u);
      announceContextChange(u.id);
      setTarget(null);
      setLocation("/");
    },
    onError: (e) => setError(errMsg(e)),
  });
  if (!sites.length) return null;
  const disabled = sw.isPending || busyElsewhere;
  return (
    <div className="mx-3 mb-3 rounded-xl border border-sidebar-border bg-card px-3 py-2.5" data-testid="card-location-context">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"><span>Working at</span>{busyElsewhere && !sw.isPending && <span className="normal-case tracking-normal text-[10px]">Saving…</span>}</div>
      <label className="sr-only" htmlFor="select-location-context">Current location</label>
      <div className="relative mt-1">
        <MapPin className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--brand-orange))]" strokeWidth={1.7} />
        <select id="select-location-context" className={cn("h-8 w-full appearance-none truncate rounded-md border border-input bg-background pl-7 pr-2 text-[13px] font-medium", disabled && "opacity-60")} value={active ?? ""} disabled={disabled} onChange={(e) => { setError(null); if (e.target.value && e.target.value !== active) setTarget(e.target.value); }} data-testid="select-location-context">
          {!active && <option value="">Choose a location</option>}
          {sites.map((s) => <option key={s} value={s}>{s} · {roleLabel(map[s])}</option>)}
        </select>
      </div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground" data-testid="text-active-site-role">{active ? `Acting as ${roleLabel(map[active] ?? user.role)}` : "No location selected"}</div>
      {error && !target && <p role="alert" className="mt-1 text-[11px] text-destructive" data-testid="text-location-error">{error}</p>}
      <Dialog open={!!target} onOpenChange={(o) => { if (!o && !sw.isPending) { setTarget(null); setError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Switch to {target}?</DialogTitle>
            <DialogDescription>You will act as <span className="font-medium text-foreground">{target ? roleLabel(map[target]) : ""}</span> and see only that location's patients and work. Roles are not combined across locations.</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>This changes your whole signed-in session, including other open tabs. Save or close drafts in all tabs first; nothing is saved or discarded for you.</li>
            <li>Running or unsaved tracked time must be finished before switching; it will not be discarded.</li>
            <li>You'll return to Today with fresh data for the new location.</li>
          </ul>
          {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive" data-testid="text-location-switch-error">{error}</p>}
          <DialogFooter>
            <Btn variant="ghost" onClick={() => { setTarget(null); setError(null); }} disabled={sw.isPending}>Stay at {active ?? "current"}</Btn>
            <Btn variant="primary" disabled={disabled} onClick={() => { setError(null); if (target) sw.mutate(target); }} data-testid="button-confirm-location">{sw.isPending ? "Switching…" : "Switch location"}</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
