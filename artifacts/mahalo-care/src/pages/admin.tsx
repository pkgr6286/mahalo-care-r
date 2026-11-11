import { FileStack } from "lucide-react";
import { RulesManager } from "@/components/rules/rules-manager";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FlaskConical, Pencil, Plug, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionResult, CareRecord } from "@workspace/api-client-react";
import { useGetSettings, useListPatients, useListRecords, getListPatientsQueryKey, useUpdateSettings, getGetSettingsQueryKey, type PracticeSettings } from "@workspace/api-client-react";
import { Btn, ConfirmButton, EmptyState, ErrorState, Field, PageHeader, Panel, ProgramTag, RecordDialog, SimLabel, SkeletonRows, StatusPill, Tabs, inputCls, useRecordDialog, type BaseField, type MetaField } from "@/components/kit";
import { PagedList } from "@/components/list-tools";
import { errMsg, fmtDateTime, fmtRel, mStr, useAction, type Kind } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { AccountsTab } from "@/components/accounts-admin";
import { OperationsTab } from "@/components/operations-admin";
import { InstrumentReviewPanel } from "@/components/admin/instrument-review";
import { EducationAuthoring } from "@/components/admin/education-authoring";
import { ConfigTransferPanel } from "@/components/admin/config-transfer";
import { GovernanceReports } from "@/components/security-reports";
import { PatientImport } from "@/components/patient-import";

type T = "settings" | "accounts" | "operations" | "locations" | "staff" | "rules" | "templates" | "instruments" | "education" | "integrations" | "audit" | "governance";

const CFG: Record<"locations" | "staff" | "rules" | "templates", { title: string; fields: BaseField[]; meta: MetaField[]; status?: string[]; titleLabel?: string; descLabel?: string }> = {
  locations: { title: "Site", titleLabel: "Site name", fields: ["status", "description"], status: ["active", "inactive"], meta: [{ key: "address", label: "Address" }, { key: "phone", label: "Phone" }], descLabel: "Notes" },
  staff: { title: "Directory entry", titleLabel: "Full name", fields: ["status"], status: ["active", "inactive"], meta: [{ key: "role", label: "Role" }, { key: "credential", label: "Credential" }, { key: "email", label: "Email" }, { key: "location", label: "Primary site" }] },
  rules: { title: "Rule", fields: ["program", "severity", "status", "description"], status: ["active", "paused", "draft"], meta: [{ key: "kind", label: "Rule kind", hint: "threshold, trend, missing_data, adherence, score, time_budget or device_days_at_risk" }, { key: "condition", label: "Condition expression", hint: "e.g. systolic >= 160" }, { key: "threshold", label: "Threshold", type: "number" }, { key:"days",label:"Days without data",type:"number" }, { key:"windowDays",label:"Window (days)",type:"number" }, { key:"minPoints",label:"Minimum trend samples",type:"number" }, { key:"rate",label:"Minimum completion rate (0–1)",type:"number" }, { key:"escalateAfterHours",label:"Escalate after hours",type:"number" }], descLabel: "What the rule detects" },
  templates: { title: "Template", meta: [], fields: ["program", "status", "description"], status: ["active", "draft"], descLabel: "Template body" },
};

export default function AdminPage() {
  const [tab, setTab] = useState<T>("settings");
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Practice setup" desc="Set up people, locations and care defaults once. Daily care starts in Today and Worklists." actions={<Link href="/policies" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-input bg-card px-4 text-sm font-medium hover:bg-secondary" data-testid="link-admin-policies"><FileStack className="h-4 w-4" />Policies and templates</Link>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "settings", label: "Settings" }, { id: "accounts", label: "Accounts" }, { id: "locations", label: "Locations" }, { id: "staff", label: "Staff directory" }, { id: "rules", label: "Rules" }, { id: "templates", label: "Templates" }, { id: "instruments", label: "Instruments" }, { id: "education", label: "Learning" }, { id: "operations", label: "Operations" }, { id: "integrations", label: "Integrations" }, { id: "audit", label: "Audit" }, { id: "governance", label: "Access governance" }]} />
      <div className="mt-5" key={tab}>
        {tab === "settings" && <SettingsTab />}
        {tab === "settings" && <PatientImport />}
        {tab === "accounts" && <AccountsTab />}
        {tab === "operations" && <OperationsTab />}
        {(tab === "locations" || tab === "staff" || tab === "templates") && <RecordList kind={tab} />}
        {tab === "rules" && <RulesManager />}
        {tab === "instruments" && <InstrumentReviewPanel />}
        {tab === "education" && <EducationAuthoring />}
        {tab === "integrations" && <Integrations />}
        {tab === "audit" && <Audit />}
        {tab === "governance" && <GovernanceReports mode="admin" />}
      </div>
    </div>
  );
}

function SettingsTab() {
  const q = useGetSettings();
  const upd = useUpdateSettings();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [v, setV] = useState<PracticeSettings | null>(null);
  useEffect(() => { if (q.data && !v) setV(q.data); }, [q.data, v]);
  if (q.isLoading || !v) return q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <SkeletonRows rows={4} />;
  const set = (k: keyof PracticeSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    upd.mutate({ data: v }, {
      onSuccess: (s) => { qc.setQueryData(getGetSettingsQueryKey(), s); qc.invalidateQueries(); toast({ title: "Settings saved" }); },
      onError: (err) => toast({ title: "Could not save", description: errMsg(err), variant: "destructive" }),
    });
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Panel title="Practice">
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Practice name" className="sm:col-span-2"><input className={inputCls} value={v.name} onChange={set("name")} required data-testid="input-practice-name" /></Field>
          <Field label="Support email"><input type="email" className={inputCls} value={v.supportEmail} onChange={set("supportEmail")} data-testid="input-support-email" /></Field>
          <Field label="Support phone"><input className={inputCls} value={v.supportPhone} onChange={set("supportPhone")} data-testid="input-support-phone" /></Field>
          <Field label="Timezone"><input className={inputCls} value={v.timezone} onChange={set("timezone")} data-testid="input-tz" /></Field>
          <Field label="Patient app name"><input className={inputCls} value={v.patientAppName} onChange={set("patientAppName")} data-testid="input-app-name" /></Field>
          <Field label="Accent color"><div className="flex gap-2"><input type="color" className="h-9 w-12 rounded border border-input" value={v.accentColor} onChange={set("accentColor")} data-testid="input-accent" /><input className={inputCls} value={v.accentColor} onChange={set("accentColor")} /></div></Field>
          <Field label="Quiet hours"><input className={inputCls} value={v.quietHours} onChange={set("quietHours")} placeholder="21:00-07:00" data-testid="input-quiet" /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={v.notifications} onChange={(e) => setV({ ...v, notifications: e.target.checked })} data-testid="checkbox-notifications" />Send patient notifications (simulated delivery)</label>
          <div className="sm:col-span-2"><Btn type="submit" variant="primary" disabled={upd.isPending} data-testid="button-save-settings">{upd.isPending ? "Saving…" : "Save settings"}</Btn></div>
        </form>
      </Panel>
      <ConfigTransferPanel />
    </div>
  );
}

function RecordList({ kind }: { kind: "locations" | "staff" | "rules" | "templates" }) {
  const q = useListRecords(kind as Kind);
  const dlg = useRecordDialog();
  const c = CFG[kind];
  return (
    <>
      {kind === "staff" && <div className="mb-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground" data-testid="note-staff-directory">Staff directory entries only. Adding someone here does not create a sign-in account or grant access.</div>}
      <div className="mb-3 flex justify-end"><Btn variant="primary" onClick={dlg.create} data-testid={`button-new-${kind}`}><Plus className="h-4 w-4" />Add {c.title.toLowerCase()}</Btn></div>
      {q.isLoading ? <SkeletonRows rows={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title={`No ${kind}`} /> : (
        <div className="rise overflow-hidden rounded-xl border border-card-border bg-card">
          <PagedList items={q.data} noun={kind} testid={`pager-${kind}`} render={(r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0" data-testid={`row-${kind}-${r.id}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{r.title}<ProgramTag p={r.program} />{r.severity && <StatusPill value={r.severity} />}<StatusPill value={r.status} /></div>
                <div className="truncate text-xs text-muted-foreground">{staffSummary(r) ?? c.meta.map((m) => mStr(r, m.key)).filter(Boolean).join(" · ")}{r.description ? ` · ${r.description}` : ""}</div>
              </div>
              {kind === "rules" && <RulePreview ruleId={r.id} title={r.title} />}
              <Btn size="sm" variant="ghost" onClick={() => dlg.edit(r)} data-testid={`button-edit-${r.id}`}><Pencil className="h-3.5 w-3.5" /></Btn>
            </div>
          )} />
        </div>
      )}
      <RecordDialog open={dlg.open} onOpenChange={dlg.onOpenChange} kind={kind} record={dlg.record} title={dlg.record ? `Edit ${c.title.toLowerCase()}` : `New ${c.title.toLowerCase()}`} fields={c.fields} meta={c.meta} statusOptions={c.status} titleLabel={c.titleLabel} descLabel={c.descLabel} />
    </>
  );
}

/** Linked staff-account records: show role per site rather than implying the base role applies everywhere. */
function staffSummary(r: CareRecord): string | null {
  const md = (r.metadata ?? {}) as Record<string, unknown>;
  if (r.kind !== "staff" || md.identitySource !== "staff_account") return null;
  const nice = (x: string) => x.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const sr = md.siteRoles && typeof md.siteRoles === "object" ? Object.entries(md.siteRoles as Record<string, unknown>).filter(([, v]) => typeof v === "string" && v) as [string, string][] : [];
  const access = sr.length ? sr.map(([site, role]) => `${nice(role)} at ${site}`).join(", ") : typeof md.role === "string" ? nice(md.role) : "";
  return ["Linked account", access, mStr(r, "credential"), mStr(r, "email")].filter(Boolean).join(" · ");
}

function Integrations() {
  const q = useListRecords("integrations");
  const { run, pending } = useAction();
  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div>
      <div className="mb-4 rounded-lg border border-dashed border-[hsl(188_50%_60%)] bg-[hsl(185_55%_97%)] px-4 py-3 text-sm text-[hsl(188_70%_24%)]">Every driver below is simulated. Tests exercise a local stub and never contact a vendor. No integration is live.</div>
      <div className="grid gap-3 md:grid-cols-2">
        {(q.data ?? []).map((i) => (
          <div key={i.id} className="rise rounded-xl border border-card-border bg-card p-4" data-testid={`card-integration-${i.id}`}>
            <div className="flex items-center gap-2"><Plug className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} /><span className="text-sm font-semibold">{i.title}</span><SimLabel /><span className="ml-auto"><StatusPill value={i.status} /></span></div>
            <p className="mt-1 text-xs text-muted-foreground">{i.description}</p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{mStr(i, "lastTestedAt") ? `Last test ${fmtRel(mStr(i, "lastTestedAt"))}` : "Not tested"}</span>
              <Btn size="sm" disabled={pending} onClick={() => run({ action: "testIntegration", id: i.id })} data-testid={`button-test-${i.id}`}>Run simulated test</Btn>
            </div>
          </div>
        ))}
      </div>
      <NotificationOutbox />
    </div>
  );
}

function Audit() {
  const q = useListRecords("audit");
  const [s, setS] = useState("");
  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const list = [...(q.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter((a) => `${a.title} ${a.assignee ?? ""} ${a.patientName} ${a.description ?? ""}`.toLowerCase().includes(s.toLowerCase()));
  return (
    <div>
      <div className="mb-3 flex gap-2"><input className={inputCls} placeholder="Filter audit trail" value={s} onChange={(e) => setS(e.target.value)} data-testid="input-audit-filter" /><a href="/api/exports/audit" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-input bg-card px-3.5 text-sm font-medium hover:bg-muted" data-testid="link-export-audit"><Download className="h-4 w-4" />CSV</a><a href="/api/exports/audit?format=xlsx" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-input bg-card px-3.5 text-sm font-medium hover:bg-muted" data-testid="link-export-audit-xlsx"><Download className="h-4 w-4" />XLSX</a></div>
      <div className="overflow-hidden rounded-xl border border-card-border bg-card font-mono text-xs">
        <PagedList items={list} pageSize={40} noun="events" testid="pager-audit" pagerClassName="font-sans" render={(a) => (
          <div key={a.id} className="grid grid-cols-[130px_1fr] gap-3 border-b border-border px-4 py-2 last:border-b-0 sm:grid-cols-[140px_140px_1fr_160px]" data-testid={`row-audit-${a.id}`}>
            <span className="text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
            <span className="truncate">{a.assignee ?? "system"}</span>
            <span className="truncate font-sans text-[13px]">{a.title}{a.description ? <span className="text-muted-foreground"> · {a.description}</span> : null}</span>
            <span className="hidden truncate text-muted-foreground sm:block">{a.patientName}</span>
          </div>
        )} />
        {!list.length && <div className="p-4 font-sans"><EmptyState title="No audit events match" /></div>}
      </div>
    </div>
  );
}

function RulePreview({ ruleId, title }: { ruleId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const patients = useListPatients(undefined, { query: { enabled: open, queryKey: getListPatientsQueryKey() } });
  const { run, pending } = useAction();
  return (
    <>
      <Btn size="sm" onClick={() => { setResult(null); setOpen(true); }} data-testid={`button-preview-rule-${ruleId}`}><FlaskConical className="h-3.5 w-3.5" />Preview</Btn>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Historical preview: {title}</DialogTitle><DialogDescription>Runs this rule against one synthetic patient's stored history. Preview only; no exceptions are created.</DialogDescription></DialogHeader>
          <Field label="Patient">
            <select className={inputCls} value={pid} onChange={(e) => { setPid(e.target.value); setResult(null); }} data-testid="select-rule-patient">
              <option value="">Select patient</option>
              {(patients.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.lastName}, {p.firstName} · {p.mrn}</option>)}
            </select>
          </Field>
          {result && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs" data-testid="text-rule-result">
              <div className="font-medium">{result.message}</div>
              {(result.records ?? []).slice(0, 12).map((r) => <div key={r.id} className="mt-1 flex justify-between gap-2"><span>{r.title}</span><span className="text-muted-foreground">{fmtDateTime(r.date ?? r.createdAt)}</span></div>)}
            </div>
          )}
          <DialogFooter>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Close</Btn>
            <Btn variant="primary" disabled={!pid || pending} onClick={() => run({ action: "testRule", id: ruleId, patientId: pid }, setResult)} data-testid="button-run-rule-preview">{pending ? "Running…" : "Run preview"}</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NotificationOutbox() {
  const q = useListRecords("notifications");
  return (
    <Panel title="Notification outbox" sub="Captured locally. No email, SMS or push is sent." action={<SimLabel text="Console only" />} className="mt-5" bodyClass="p-0">
      {q.isLoading ? <div className="p-4"><SkeletonRows rows={3} /></div> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : !q.data?.length ? <div className="p-4"><EmptyState title="Outbox empty" desc="Patient messages and critical exceptions add captured rows here." /></div> : (
        <div>
          <PagedList items={[...q.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt))} pageSize={10} noun="notifications" testid="pager-outbox" render={(r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0" data-testid={`row-notification-${r.id}`}>
              <span className="w-32 text-xs text-muted-foreground">{fmtDateTime(r.createdAt)}</span>
              <span className="rounded border border-border px-1.5 font-mono text-[10px] uppercase">{mStr(r, "channel") || "console"}</span>
              <span className="min-w-0 flex-1 truncate">{r.title}{r.patientName ? <span className="text-muted-foreground"> · {r.patientName}</span> : null}</span>
              <StatusPill value={r.status} />
            </div>
          )} />
        </div>
      )}
    </Panel>
  );
}
