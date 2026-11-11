import { Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuietHours = { enabled: boolean; start: string; end: string };
export const QUIET_DEFAULT: QuietHours = { enabled: false, start: "22:00", end: "08:00" };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Returns an error message, or null when the window is valid (or disabled). */
export function quietHoursError(q: QuietHours): string | null {
  if (!q.enabled) return null;
  if (!HHMM.test(q.start) || !HHMM.test(q.end)) return "Use 24-hour times, for example 22:00.";
  if (q.start === q.end) return "Start and end must be different times.";
  return null;
}

export function QuietHoursField({ value, onChange, timezone }: { value: QuietHours; onChange: (q: QuietHours) => void; timezone?: string | null }) {
  const err = quietHoursError(value);
  const overnight = value.enabled && !err && value.end < value.start;
  const field = "h-9 w-full rounded-lg border border-input bg-card px-2.5 font-mono text-sm tnum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-orange))]/40 disabled:opacity-50";
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3" data-testid="quiet-hours">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium"><Moon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />Quiet hours</span>
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} className="h-5 w-5 accent-[hsl(var(--primary))]" data-testid="checkbox-quiet-hours" />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[11px] text-muted-foreground">From
          <input type="time" step={60} className={cn(field, "mt-1", err && value.enabled && "border-destructive")} value={value.start} disabled={!value.enabled} onChange={(e) => onChange({ ...value, start: e.target.value })} data-testid="input-quiet-start" />
        </label>
        <label className="text-[11px] text-muted-foreground">Until
          <input type="time" step={60} className={cn(field, "mt-1", err && value.enabled && "border-destructive")} value={value.end} disabled={!value.enabled} onChange={(e) => onChange({ ...value, end: e.target.value })} data-testid="input-quiet-end" />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Times are in your care timezone: <span className="font-medium text-foreground/80">{timezone || "practice default"}</span>{overnight ? ". Runs overnight into the next morning." : "."}</p>
      {err && <p role="alert" className="mt-1 text-[11px] text-destructive">{err}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">During quiet hours, email, text and push reminders wait until the window ends. Secure messages in this app stay available at all times, and your care team's alerts are not delayed. This app is not an emergency service; if you need urgent help, contact your local emergency services.</p>
    </div>
  );
}
