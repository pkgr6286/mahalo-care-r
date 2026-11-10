import { Link } from "wouter";
import { AlertOctagon, ArrowUpRight, CalendarClock, Clock, FileCheck2, HeartPulse, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useGetCurrentUser, getGetCurrentUserQueryKey, useGetDashboard } from "@workspace/api-client-react";
import { EmptyState, ErrorState, PageHeader, Panel, SkeletonRows, Stat } from "@/components/kit";
import { ActivityRow, ExceptionRow, TaskRow } from "@/components/records";

export default function TodayPage() {
  const me = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const d = useGetDashboard();
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = me.data?.name.split(" ")[0] ?? "";

  return (
    <div>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        title={`${greet}${first ? `, ${first}` : ""}`}
        desc={d.data ? `${d.data.criticalExceptions} critical and ${d.data.openExceptions} open exceptions across ${d.data.patientCount} patients. Everyone else is on track.` : "Pulling together what changed overnight."}
        actions={<Link href="/worklists" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:bg-[hsl(243_79%_50%)]" data-testid="link-open-worklist">Open worklist <ArrowUpRight className="h-4 w-4" /></Link>}
      />
      {d.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3"><SkeletonRows rows={4} className="lg:col-span-2" /><SkeletonRows rows={4} /></div>
      ) : d.isError ? (
        <ErrorState error={d.error} onRetry={() => d.refetch()} />
      ) : d.data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="Critical" value={d.data.criticalExceptions} tone="red" icon={<AlertOctagon className="h-4 w-4" strokeWidth={1.6} />} hint={`${d.data.openExceptions} open total`} testid="stat-critical" />
            <Stat label="Due today" value={d.data.dueToday} tone="amber" icon={<CalendarClock className="h-4 w-4" strokeWidth={1.6} />} hint="Tasks and reviews" testid="stat-due" />
            <Stat label="At risk" value={d.data.atRisk} tone="red" icon={<HeartPulse className="h-4 w-4" strokeWidth={1.6} />} hint="Risk tier high" testid="stat-risk" />
            <Stat label="Patients" value={d.data.patientCount} icon={<Users className="h-4 w-4" strokeWidth={1.6} />} hint={`${d.data.activeEnrollments} active enrollments`} testid="stat-patients" />
            <Stat label="Minutes this month" value={d.data.monthlyMinutes.toLocaleString()} tone="indigo" icon={<Clock className="h-4 w-4" strokeWidth={1.6} />} hint="Committed care time" testid="stat-minutes" />
            <Stat label="Eligible lines" value={d.data.eligibleLines} tone="green" icon={<FileCheck2 className="h-4 w-4" strokeWidth={1.6} />} hint="Billing evidence met" testid="stat-lines" />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <Panel title="Exceptions needing a decision" sub="Sorted by severity. Resolve with a note; every action is audited." action={<Link href="/worklists" className="text-xs font-medium text-primary hover:underline">All exceptions</Link>} bodyClass="py-1">
              {d.data.exceptions.length ? d.data.exceptions.map((r) => <ExceptionRow key={r.id} r={r} />) : <div className="py-4"><EmptyState title="Inbox zero on exceptions" desc="New out-of-range readings and missed check-ins will appear here." /></div>}
            </Panel>
            <div className="space-y-5">
              <Panel title="Tasks" sub="Assigned to the care team" bodyClass="py-1">
                {d.data.tasks.length ? d.data.tasks.map((r) => <TaskRow key={r.id} r={r} />) : <div className="py-3"><EmptyState title="No tasks due" /></div>}
              </Panel>
              <Panel title="Program load">
                <div className="space-y-3">
                  {d.data.programStats.map((p) => {
                    const max = Math.max(...d.data!.programStats.map((x) => x.enrolled), 1);
                    return (
                      <div key={p.key} data-testid={`row-program-${p.key}`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{p.key} <span className="font-normal text-muted-foreground">· {p.name}</span></span>
                          <span className="tnum text-muted-foreground">{p.enrolled} enrolled · <span className={p.atRisk ? "text-destructive" : ""}>{p.atRisk} at risk</span></span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(p.enrolled / max) * 100}%`, background: p.color || "hsl(var(--primary))" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <Panel title="Readings and completed work" sub="Trailing trend across the practice">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.data.trend} margin={{ left: -18, right: 6, top: 6 }}>
                    <defs>
                      <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="hsl(243 79% 56%)" stopOpacity={0.18} /><stop offset="1" stopColor="hsl(243 79% 56%)" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid stroke="hsl(220 24% 93%)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(218 18% 44%)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(218 18% 44%)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(220 24% 89%)", fontSize: 12 }} />
                    <Area type="monotone" dataKey="readings" stroke="hsl(243 79% 56%)" strokeWidth={1.8} fill="url(#gr)" />
                    <Area type="monotone" dataKey="completed" stroke="hsl(216 79% 13%)" strokeWidth={1.5} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Recent activity" bodyClass="py-2 max-h-[280px] overflow-y-auto">
              {d.data.activity.length ? d.data.activity.map((r) => <ActivityRow key={r.id} r={r} />) : <p className="py-6 text-center text-xs text-muted-foreground">No activity yet.</p>}
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}
