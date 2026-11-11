import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, Square, Timer, Trash2 } from "lucide-react";
import { useListRecords, getListRecordsQueryKey, type User } from "@workspace/api-client-react";
import { Btn, ConfirmButton, ProgramTag } from "@/components/kit";
import { activityLabel, mStr, useAction } from "@/lib/api";
import { can } from "@/components/access";

export function GlobalTimer({ user }: { user: User }) {
  const enabled = can(user, "time.write");
  const q = useListRecords("time", { query: { enabled, queryKey: getListRecordsQueryKey("time"), refetchInterval: 15_000, refetchOnWindowFocus: true } });
  const running = enabled ? (q.data ?? []).find((r) => r.status === "running" && mStr(r, "userId") === user.id) : undefined;
  const { run, pending } = useAction();
  const [location] = useLocation();
  const [now, setNow] = useState(() => Date.now());
  const [keptFor, setKeptFor] = useState<string | null>(null);
  const [nudgedAt, setNudgedAt] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!running) return null;
  const started = new Date(mStr(running, "startedAt") || running.createdAt).getTime();
  const s = Math.max(0, Math.floor((now - started) / 1000));
  const h = Math.floor(s / 3600);
  const clock = (h ? h + ":" : "") + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  const viewing = location.match(/^\/patients\/([^/]+)/)?.[1];
  const block = Math.floor(s / 900);
  const nudge = block >= 1 && block !== nudgedAt;
  const elsewhere = !!viewing && viewing !== running.patientId && keptFor !== viewing;
  return (
    <div className="sticky top-0 z-30 md:top-0" data-testid="global-timer">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[hsl(var(--brand-orange))]/30 bg-accent/90 px-4 py-2 backdrop-blur md:px-10">
        <span className="flex items-center gap-2"><Timer className="h-4 w-4 text-primary" strokeWidth={1.6} /><span className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" /></span>
        <span className="tnum font-mono text-sm font-semibold text-accent-foreground" aria-label="Elapsed time" data-testid="text-global-timer-elapsed">{clock}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm">
          {running.patientId ? <Link href={"/patients/" + running.patientId} className="truncate font-medium hover:text-primary" data-testid="link-global-timer-patient">{running.patientName}</Link> : <span className="font-medium">{running.patientName}</span>}
          <ProgramTag p={running.program} />
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">{activityLabel(mStr(running, "activity")) || running.title}</span>
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <ConfirmButton size="sm" variant="ghost" label="Discard" icon={<Trash2 className="h-3.5 w-3.5" />} title="Discard running timer" desc="No time is recorded. The discard and your reason are audited." reason reasonLabel="Why discard?" confirmLabel="Discard" pending={pending} onConfirm={(r, c) => run({ action: "discardTimer", id: running.id, reason: r }, c)} testid="button-global-timer-discard" />
          <ConfirmButton size="sm" variant="primary" label="Stop and commit" icon={<Square className="h-3 w-3" />} title="Stop timer" desc={"Commits the actual elapsed time (" + clock + ") for " + running.patientName + "."} confirmLabel="Stop and commit" pending={pending} onConfirm={(_, c) => run({ action: "stopTimer", id: running.id }, c)} testid="button-global-timer-stop" />
        </span>
      </div>
      {nudge && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-b border-border bg-card/95 px-4 py-2 text-xs md:px-10" data-testid="banner-timer-nudge">
          <span className="min-w-0 flex-1">Confirm the timer still reflects actual care for {running.patientName}. Nothing changes automatically.</span>
          <Btn size="sm" onClick={() => setNudgedAt(block)} data-testid="button-timer-still-caring">Still accurate</Btn>
        </div>
      )}
      {elsewhere && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-[hsl(38_80%_82%)] bg-[hsl(38_95%_95%)] px-4 py-2 text-xs text-[hsl(30_80%_30%)] md:px-10" data-testid="banner-timer-other-patient">
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.6} />
          <span className="min-w-0 flex-1">Your timer is still running for <span className="font-semibold">{running.patientName}</span>, not the patient you're viewing. Time is only counted for {running.patientName}.</span>
          <Btn size="sm" onClick={() => setKeptFor(viewing!)} data-testid="button-timer-keep-running">Keep running</Btn>
        </div>
      )}
    </div>
  );
}
