import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarRange, ChevronLeft, ChevronRight, FileJson, FileText, Fingerprint, KeyRound, Loader2, ScrollText, ShieldCheck, Siren, Users } from "lucide-react";
import {
  useGetSecurityOverview, getGetSecurityOverviewQueryKey,
  useListSecurityReports, getListSecurityReportsQueryKey,
  useGetSecurityReport, getGetSecurityReportQueryKey,
  useCreateSecurityReport, useVerifySecurityReport,
  type SecurityReportInfo, type SecurityReportKind, type SecurityReportVerification, type SecurityReportView, type SecurityOverview,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, EmptyState, ErrorState, Field, Pill, SkeletonRows, inputCls } from "@/components/kit";
import { usePermission } from "@/components/access";
import { useToast } from "@/hooks/use-toast";
import { errMsg, fmtDate, fmtDateTime } from "@/lib/api";
import { downloadFile } from "@/lib/http";
import { cn } from "@/lib/utils";

/** Only effective admin / clinical_admin may see or fetch the governance surface. */
export function useGovernanceRole() {
  const { user } = usePermission();
  const role = user?.role;
  return { role, allowed: role === "admin" || role === "clinical_admin", isAdmin: role === "admin" };
}

const KIND: Record<SecurityReportKind, { label: string; short: string; cadence: "monthly" | "weekly"; icon: typeof Users; hue: string; blurb: string }> = {
  access_review: { label: "Staff access review", short: "Access review", cadence: "monthly", icon: Users, hue: "var(--brand-orange)", blurb: "Who could sign in, with which roles and sites, captured at one moment." },
  audit_integrity: { label: "Audit integrity checkpoint", short: "Audit checkpoint", cadence: "monthly", icon: ScrollText, hue: "var(--brand-cyan)", blurb: "Freezes the audit events for a month so later edits or removals can be detected." },
  weekly_emergency_access: { label: "Emergency access review", short: "Emergency access", cadence: "weekly", icon: Siren, hue: "var(--brand-coral)", blurb: "Every break-glass chart opening in a week, with the stated reason." },
};
const roleLabel = (r?: string | null) => (r ? r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "None");
const periodLabel = (r: Pick<SecurityReportInfo, "kind" | "period">) => {
  if (KIND[r.kind]?.cadence === "weekly") return `Week of ${fmtDate(r.period + "T12:00:00")}`;
  const [y, m] = r.period.split("-").map(Number);
  return y && m ? new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" }) : r.period;
};

/* ------------------------------------------------------------------ */
export function GovernanceReports({ mode }: { mode: "admin" | "clinical" }) {
  const gov = useGovernanceRole();
  const ov = useGetSecurityOverview({ query: { enabled: gov.allowed, queryKey: getGetSecurityOverviewQueryKey() } });
  if (!gov.allowed) return null;
  if (ov.isLoading) return <SkeletonRows rows={5} />;
  if (ov.isError || !ov.data) return <ErrorState error={ov.error} onRetry={() => ov.refetch()} />;
  const kinds = mode === "clinical" ? ov.data.reportKinds.filter((k) => k === "weekly_emergency_access") : ov.data.reportKinds;
  if (!kinds.length) return <EmptyState title="No governance reports for your role" desc="Your current access does not include any report types." />;
  return <GovernanceBody overview={ov.data} kinds={kinds} mode={mode} />;
}

function GovernanceBody({ overview, kinds, mode }: { overview: SecurityOverview; kinds: SecurityReportKind[]; mode: "admin" | "clinical" }) {
  const [filter, setFilter] = useState<SecurityReportKind | "">(kinds.length === 1 ? kinds[0] : "");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const pageSize = 12;
  const params = { kind: filter || (kinds.length === 1 ? kinds[0] : undefined), page, pageSize };
  const list = useListSecurityReports(params, { query: { queryKey: getListSecurityReportsQueryKey(params) } });
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <div className="space-y-5" data-testid={`governance-${mode}`}>
      <section className="rise relative overflow-hidden rounded-2xl border border-card-border bg-card">
        <div className="brand-rule h-[3px] w-full" />
        <div className="grid gap-6 p-5 md:grid-cols-[1.2fr_1fr] md:p-6">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Access governance</div>
            <h2 className="mt-1 text-[1.65rem] leading-tight">{mode === "clinical" ? "Emergency access in your sites" : "Who had access, and what was recorded"}</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">Each report is a frozen snapshot taken when it was generated. Statuses inside a report describe that moment, not today. {mode === "clinical" ? "You see only the sites in your current location scope." : "Monthly reports cover the whole practice."}</p>
            <div className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2.5 py-1"><CalendarRange className="h-3 w-3" strokeWidth={1.6} />Practice calendar {overview.defaults.timeZone}</span>
              {overview.locationScopes.length > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2.5 py-1" data-testid="text-scope">Scope: {overview.locationScopes.join(", ")}</span>}
              {overview.isPracticeAdmin && <span className="inline-flex items-center rounded-full border border-border bg-secondary/60 px-2.5 py-1">Practice-wide</span>}
            </div>
          </div>
          <Generator overview={overview} kinds={kinds} onCreated={(r) => { setFilter(kinds.length === 1 ? kinds[0] : ""); setPage(1); setOpenId(r.id); }} />
        </div>
      </section>

      <section className="rise rise-2 overflow-hidden rounded-2xl border border-card-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
          <h3 className="text-lg">Report archive</h3>
          {list.data && <span className="tnum text-xs text-muted-foreground" data-testid="text-report-total">{list.data.total} {list.data.total === 1 ? "report" : "reports"}</span>}
          {kinds.length > 1 && (
            <div className="ml-auto flex flex-wrap gap-1 rounded-full border border-border bg-secondary/50 p-0.5">
              {[["", "All"] as const, ...kinds.map((k) => [k, KIND[k].short] as const)].map(([k, l]) => (
                <button key={k || "all"} onClick={() => { setFilter(k as SecurityReportKind | ""); setPage(1); }} className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", filter === k ? "bg-card text-foreground shadow-[var(--shadow-sm)]" : "text-muted-foreground hover:text-foreground")} data-testid={`filter-kind-${k || "all"}`}>{l}</button>
              ))}
            </div>
          )}
        </div>
        {list.isLoading ? <div className="p-5"><SkeletonRows rows={4} /></div>
          : list.isError ? <div className="p-5"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div>
          : !list.data?.reports.length ? <div className="p-5"><EmptyState icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.6} />} title="No reports captured yet" desc="Generate a report above. It appears here with its downloads and verification." /></div>
          : (
            <div className={cn("transition-opacity", list.isFetching && "opacity-60")}>
              {list.data.reports.map((r) => <ReportRow key={r.id} r={r} onOpen={() => setOpenId(r.id)} />)}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
                  <span className="tnum">Page {page} of {totalPages}</span>
                  <div className="flex gap-1">
                    <Btn size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-reports-prev"><ChevronLeft className="h-3.5 w-3.5" />Newer</Btn>
                    <Btn size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)} data-testid="button-reports-next">Older<ChevronRight className="h-3.5 w-3.5" /></Btn>
                  </div>
                </div>
              )}
            </div>
          )}
      </section>
      <ReportDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Generator({ overview, kinds, onCreated }: { overview: SecurityOverview; kinds: SecurityReportKind[]; onCreated: (r: SecurityReportInfo) => void }) {
  const [kind, setKind] = useState<SecurityReportKind>(kinds[0]);
  const [custom, setCustom] = useState(false);
  const [period, setPeriod] = useState("");
  const [verify, setVerify] = useState(false);
  const create = useCreateSecurityReport();
  const qc = useQueryClient();
  const { toast } = useToast();
  const weekly = KIND[kind].cadence === "weekly";
  const def = weekly ? overview.defaults.weekStart : overview.defaults.month;
  const periodValid = !custom || (weekly ? /^\d{4}-\d{2}-\d{2}$/.test(period) && new Date(period + "T12:00:00").getDay() === 1 : /^\d{4}-\d{2}$/.test(period));
  const Icon = KIND[kind].icon;

  const submit = async () => {
    try {
      const r = await create.mutateAsync({ data: { kind, ...(custom ? { period } : {}), timeZone: overview.defaults.timeZone, includeVerification: kind === "audit_integrity" ? false : verify } });
      qc.invalidateQueries({ queryKey: getListSecurityReportsQueryKey().slice(0, 1) });
      toast({ title: `${KIND[kind].short} captured`, description: `${periodLabel(r)} · ${r.sourceRows} source rows frozen.` });
      onCreated(r);
    } catch (e) {
      toast({ title: "Could not generate report", description: errMsg(e), variant: "destructive" });
    }
  };

  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-4">
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k) => {
          const K = KIND[k].icon;
          return (
            <button key={k} onClick={() => { setKind(k); setPeriod(""); setCustom(false); setVerify(false); }} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all", kind === k ? "border-foreground/20 bg-card shadow-[var(--shadow-sm)]" : "border-transparent text-muted-foreground hover:text-foreground")} data-testid={`button-kind-${k}`}>
              <K className="h-3.5 w-3.5" strokeWidth={1.6} style={{ color: `hsl(${KIND[k].hue})` }} />{KIND[k].short}
            </button>
          );
        })}
      </div>
      <div key={kind} className="fade-in mt-3 flex items-start gap-2 text-xs text-muted-foreground"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />{KIND[kind].blurb}</div>
      <div className="mt-3 space-y-2.5">
        <label className="flex items-center gap-2 text-sm"><input type="radio" className="accent-[hsl(var(--primary))]" checked={!custom} onChange={() => setCustom(false)} data-testid="radio-period-default" />{weekly ? "Week" : "Month"} of {periodLabel({ kind, period: def })} <span className="text-xs text-muted-foreground">(default)</span></label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" className="accent-[hsl(var(--primary))]" checked={custom} onChange={() => { setCustom(true); setPeriod(weekly ? overview.defaults.weekStart : overview.defaults.previousMonth); }} data-testid="radio-period-custom" />Another {weekly ? "week" : "month"}</label>
        {custom && (
          <Field label={weekly ? "Week starting (Monday)" : "Month"} hint={!periodValid ? (weekly ? "Pick a Monday." : "Use YYYY-MM.") : undefined}>
            <input type={weekly ? "date" : "month"} className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="input-period" />
          </Field>
        )}
        {kind === "audit_integrity" ? (
          <p className="rounded-lg border border-dashed border-border bg-card/60 px-3 py-2 text-[11px] text-muted-foreground" data-testid="text-audit-scope">Audit checkpoints always cover all retained audit history, including verification and legacy activity. There is nothing to opt into.</p>
        ) : (
          <details className="rounded-lg border border-dashed border-border bg-card/60 px-3 py-2 text-xs">
            <summary className="cursor-pointer select-none font-medium text-muted-foreground">Advanced</summary>
            <label className="mt-2 flex items-start gap-2"><input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={verify} onChange={(e) => setVerify(e.target.checked)} data-testid="checkbox-include-verification" /><span>Include retained test and legacy {kind === "access_review" ? "accounts" : "emergency-access activity"} <span className="text-muted-foreground">(opt-in; normally excluded from this report. This does not run a verification check.)</span></span></label>
          </details>
        )}
        <Btn variant="primary" className="w-full justify-center" disabled={create.isPending || !periodValid} onClick={submit} data-testid="button-generate-report">
          {create.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Capturing snapshot</> : <><KeyRound className="h-4 w-4" strokeWidth={1.6} />Generate {KIND[kind].short.toLowerCase()}</>}
        </Btn>
        {kind === "weekly_emergency_access" && <p className="text-[11px] text-muted-foreground">Scheduled weekly delivery is written to the local console only. No email is sent.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function summaryBits(r: SecurityReportInfo): [string, number | string][] {
  const s = r.summary;
  const n = (v?: number) => v ?? 0;
  if (r.kind === "access_review") return [["Active", n(s.activeAccounts)], ["Invited", n(s.invitedAccounts)], ["Inactive", n(s.inactiveAccounts)], ["Portal", n(s.portalAccounts)], ["Missing NPI", n(s.missingProviderNpis)]];
  if (r.kind === "weekly_emergency_access") return [["Openings", r.sourceRows], ["Staff", n(s.uniqueStaff)], ["Patients", n(s.uniquePatients)], ["Open at capture", n(s.activeAtCapture)]];
  return [["Events frozen", r.sourceRows], ["History", "All retained"]];
}

function ReportRow({ r, onOpen }: { r: SecurityReportInfo; onOpen: () => void }) {
  const K = KIND[r.kind];
  return (
    <button onClick={onOpen} className="group flex w-full flex-wrap items-center gap-4 border-b border-border px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-secondary/40" data-testid={`row-report-${r.id}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card"><K.icon className="h-4 w-4" strokeWidth={1.6} style={{ color: `hsl(${K.hue})` }} /></span>
      <span className="min-w-[180px] flex-1">
        <span className="block text-sm font-medium">{K.label} <span className="text-muted-foreground">· {periodLabel(r)}</span></span>
        <span className="block text-xs text-muted-foreground">Captured {fmtDateTime(r.createdAt)} by {r.createdBy}{r.scopeLocations.length ? ` · ${r.scopeLocations.join(", ")}` : ""}</span>
      </span>
      <span className="flex flex-wrap gap-x-4 gap-y-1">
        {summaryBits(r).map(([l, v]) => <span key={l} className="text-right"><span className="tnum block text-sm font-semibold">{v}</span><span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{l}</span></span>)}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" strokeWidth={1.6} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
function ReportDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useGetSecurityReport(id ?? "", { query: { enabled: !!id, queryKey: getGetSecurityReportQueryKey(id ?? "") } });
  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto">
        {q.isLoading ? <><DialogHeader><DialogTitle>Loading report</DialogTitle><DialogDescription>Reading the frozen snapshot.</DialogDescription></DialogHeader><SkeletonRows rows={6} /></>
          : q.isError || !q.data ? <><DialogHeader><DialogTitle>Report unavailable</DialogTitle><DialogDescription>It may be outside your current scope.</DialogDescription></DialogHeader><ErrorState error={q.error} onRetry={() => q.refetch()} /></>
          : <ReportDetail view={q.data} />}
      </DialogContent>
    </Dialog>
  );
}

function ReportDetail({ view }: { view: SecurityReportView }) {
  const r = view.report;
  const K = KIND[r.kind];
  const { toast } = useToast();
  const [dl, setDl] = useState<"pdf" | "json" | null>(null);
  const get = async (fmt: "pdf" | "json") => {
    setDl(fmt);
    try { await downloadFile(fmt === "pdf" ? r.pdfUrl : r.jsonUrl, `${r.kind}-${r.period}.${fmt}`); toast({ title: fmt === "pdf" ? "PDF downloaded" : "JSON downloaded" }); }
    catch (e) { toast({ title: "Download failed", description: errMsg(e), variant: "destructive" }); }
    finally { setDl(null); }
  };
  return (
    <div className="space-y-5">
      <DialogHeader>
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: `hsl(${K.hue})` }}><K.icon className="h-3.5 w-3.5" strokeWidth={1.6} />{K.short}</div>
        <DialogTitle className="text-2xl">{periodLabel(r)}</DialogTitle>
        <DialogDescription>Snapshot captured {fmtDateTime(r.createdAt)} by {r.createdBy} · {r.timeZone}{r.scopeLocations.length ? ` · Sites: ${r.scopeLocations.join(", ")}` : ""}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="primary" disabled={!!dl} onClick={() => get("pdf")} data-testid="button-download-pdf">{dl === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" strokeWidth={1.6} />}PDF</Btn>
        <Btn disabled={!!dl} onClick={() => get("json")} data-testid="button-download-json">{dl === "json" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" strokeWidth={1.6} />}JSON{r.kind === "audit_integrity" ? " with manifest" : ""}</Btn>
        {r.kind !== "audit_integrity" && r.includeVerification && <Pill tone="teal">Includes retained test and legacy activity</Pill>}
      </div>
      {view.notice && <div className="rounded-lg border border-dashed border-border bg-secondary/40 px-4 py-2.5 text-xs text-muted-foreground" data-testid="text-report-notice">{view.notice}</div>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {summaryBits(r).map(([l, v]) => <div key={l} className="rounded-lg border border-border bg-card px-3 py-2"><div className="tnum text-lg font-semibold">{v}</div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</div></div>)}
      </div>
      {view.accounts && <AccountsTable rows={view.accounts} />}
      {view.emergencyAccess && <EmergencyTable rows={view.emergencyAccess} />}
      {view.auditIntegrity && (
        <Section title="Audit checkpoint">
          <div className="space-y-2 p-4 text-sm">
            <p>Covers {r.sourceRows} audit events in scope <span className="font-medium">{view.auditIntegrity.scope}</span>. Audit checkpoints always include all retained audit history, including verification and legacy activity.</p>
            <p className="text-xs text-muted-foreground">{view.auditIntegrity.notice}</p>
            <p className="text-xs text-muted-foreground">The full event manifest is in the JSON download. This is an internal checkpoint, not an externally anchored ledger, legal certification or write-once storage.</p>
          </div>
        </Section>
      )}
      <VerifyPanel r={r} />
      <details className="rounded-lg border border-border px-4 py-2.5 text-xs">
        <summary className="flex cursor-pointer select-none items-center gap-1.5 font-medium text-muted-foreground"><Fingerprint className="h-3.5 w-3.5" strokeWidth={1.6} />Technical fingerprints</summary>
        <dl className="mt-2 grid gap-1 font-mono text-[11px] sm:grid-cols-[130px_1fr]">
          {([["Snapshot digest", r.digest], ["PDF SHA-256", r.pdfSha256], ["Source hash", r.sourceHash], ...(view.auditIntegrity ? [["Chain head", view.auditIntegrity.chainHead], ["Algorithm", view.auditIntegrity.algorithm]] : [])] as [string, string][]).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{v}</dd></div>)}
        </dl>
      </details>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-card-border bg-card">
      <div className="flex items-baseline gap-2 border-b border-border px-4 py-2.5"><h3 className="text-base">{title}</h3>{sub && <span className="text-xs text-muted-foreground">{sub}</span>}</div>
      {children}
    </section>
  );
}

function AccountsTable({ rows }: { rows: NonNullable<SecurityReportView["accounts"]> }) {
  return (
    <Section title="Accounts at capture" sub="NPI shown as recorded; not a licensure check">
      {!rows.length ? <div className="p-4"><EmptyState title="No accounts captured" /></div> : (
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead className="bg-secondary/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground"><tr>{["Person", "Role", "Site roles", "NPI", "Status", "Last sign-in", "Sessions"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id} className="border-t border-border align-top" data-testid={`row-account-${a.id}`}>
              <td className="px-3 py-2"><div className="font-medium">{a.name}</div><div className="text-muted-foreground">{a.email}</div></td>
              <td className="whitespace-nowrap px-3 py-2">{roleLabel(a.role)}<div className="text-muted-foreground">{a.credential}</div></td>
              <td className="px-3 py-2">{Object.keys(a.siteRoles).length ? Object.entries(a.siteRoles).map(([s, rl]) => <div key={s}>{s}: {roleLabel(rl)}</div>) : a.locationScopes.length ? a.locationScopes.join(", ") : <span className="text-muted-foreground">All sites</span>}</td>
              <td className="px-3 py-2 font-mono">{a.npi ?? <span className="font-sans text-muted-foreground">None</span>}</td>
              <td className="px-3 py-2"><Pill tone={a.status === "active" ? "green" : a.status === "invited" ? "amber" : "neutral"}>{roleLabel(a.status)}</Pill>{a.lockedUntil && <div className="mt-1 text-muted-foreground">Locked until {fmtDateTime(a.lockedUntil)}</div>}</td>
              <td className="whitespace-nowrap px-3 py-2">{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : <span className="text-muted-foreground">Never</span>}</td>
              <td className="px-3 py-2 tnum">{a.activeSessions}{a.emergencySessionsAtCapture > 0 && <div className="text-[hsl(var(--destructive))]">{a.emergencySessionsAtCapture} emergency</div>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">Sessions counts unexpired sessions with activity in the 12 hours before capture. The 15-minute staff unlock still applied to each.</p>
    </Section>
  );
}

function EmergencyTable({ rows }: { rows: NonNullable<SecurityReportView["emergencyAccess"]> }) {
  return (
    <Section title="Emergency openings" sub="Status as of capture">
      {!rows.length ? <div className="p-4"><EmptyState title="No emergency access this week" desc="No break-glass openings were recorded in scope." /></div> : (
        <div className="divide-y divide-border">{rows.map((e) => (
          <div key={e.eventId} className="grid gap-2 px-4 py-3 text-xs sm:grid-cols-[1fr_1fr_auto]" data-testid={`row-emergency-${e.eventId}`}>
            <div><div className="text-sm font-medium">{e.actorName}</div><div className="text-muted-foreground">{[roleLabel(e.roleAtAccess), e.credentialAtAccess].filter(Boolean).join(" · ")}</div></div>
            <div><div className="text-sm">{e.patientName} <span className="font-mono text-muted-foreground">{e.mrn}</span></div><div className="text-muted-foreground">{e.location}</div></div>
            <div className="sm:text-right"><Pill tone={e.status === "active" ? "red" : e.status === "ended" ? "green" : "amber"} dot>{roleLabel(e.status)}</Pill></div>
            <p className="rounded-md bg-secondary/50 px-2.5 py-1.5 text-[12px] sm:col-span-3">{e.reason}</p>
            <div className="flex flex-wrap gap-x-4 text-muted-foreground sm:col-span-3"><span>Opened {fmtDateTime(e.openedAt)}</span><span>{e.endedAt ? `Ended ${fmtDateTime(e.endedAt)}` : "Not ended"}</span><span>Expiry {fmtDateTime(e.expiresAt)}</span></div>
          </div>
        ))}</div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
function VerifyPanel({ r }: { r: SecurityReportInfo }) {
  const verify = useVerifySecurityReport();
  const { toast } = useToast();
  const [res, setRes] = useState<SecurityReportVerification | null>(null);
  const run = async () => {
    try { setRes(await verify.mutateAsync({ id: r.id })); }
    catch (e) { toast({ title: "Verification could not run", description: errMsg(e), variant: "destructive" }); }
  };
  const check = (ok: boolean, label: string) => (
    <div className="flex items-center gap-2 text-xs"><span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-[hsl(162_60%_36%)]" : "bg-[hsl(var(--destructive))]")} />{label}<span className={cn("ml-auto font-medium", ok ? "text-[hsl(162_60%_30%)]" : "text-destructive")}>{ok ? "Matches" : "Does not match"}</span></div>
  );
  const isAudit = res?.verificationScope === "audit_events";
  return (
    <Section title="Verify retained evidence">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-xs text-muted-foreground">{r.kind === "audit_integrity" ? "Re-checks the retained snapshot and PDF, then compares the captured audit events with the audit history stored now." : "Re-checks the retained snapshot and private PDF. It does not check whether current staff assignments or access still match this history."}</p>
          <Btn disabled={verify.isPending} onClick={run} data-testid="button-verify-report">{verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" strokeWidth={1.6} />}{res ? "Check again" : "Run check"}</Btn>
        </div>
        {res && (
          <div className="fade-in space-y-3" data-testid="panel-verification">
            <div className={cn("rounded-lg border px-3 py-2 text-sm font-medium", res.valid ? "border-[hsl(162_40%_75%)] bg-[hsl(162_45%_96%)] text-[hsl(162_60%_24%)]" : "border-[hsl(var(--destructive))]/30 bg-[hsl(352_70%_97%)] text-destructive")} data-testid="text-verification-result">
              {res.valid ? (isAudit ? "Retained evidence and captured audit events check out." : "Retained snapshot and PDF are intact.") : "Differences found in the retained evidence."} <span className="font-normal opacity-80">Checked {fmtDateTime(res.checkedAt)}</span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {check(res.frozenSourceValid, "Frozen source rows")}
              {check(res.privatePdfValid, "Stored PDF")}
              {check(res.snapshotDigestValid, "Snapshot digest")}
              {isAudit && res.chainMatches != null && check(res.chainMatches, "Audit chain")}
            </div>
            {isAudit ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3 text-xs">
                  <div className="mb-1 font-medium">Captured events</div>
                  <div className="tnum">{res.capturedRows} captured · <span className={res.changedRows ? "text-destructive" : ""}>{res.changedRows ?? 0} changed</span> · <span className={res.missingRows ? "text-destructive" : ""}>{res.missingRows ?? 0} missing</span></div>
                  <p className="mt-1 text-muted-foreground">Changed or missing rows existed at capture and now differ.</p>
                </div>
                <div className="rounded-lg border border-dashed border-border p-3 text-xs">
                  <div className="mb-1 font-medium">Outside the checkpoint</div>
                  <div className="tnum">{res.unlistedEvents ?? 0} newer or unlisted · {res.currentRowCount ?? 0} rows now</div>
                  <p className="mt-1 text-muted-foreground">Events recorded after or outside the capture. Expected, and not a sign of tampering.</p>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground" data-testid="text-verification-scope">{res.capturedRows} captured rows checked against the retained snapshot only. Historical access is not compared with current accounts.</p>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
