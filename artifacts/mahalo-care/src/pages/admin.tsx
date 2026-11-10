import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FlaskConical, Pencil, Plug, Plus, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionResult } from "@workspace/api-client-react";
import { useGetSettings, useListPatients, useListRecords, getListPatientsQueryKey, useUpdateSettings, getGetSettingsQueryKey, type PracticeSettings } from "@workspace/api-client-react";
import { Btn, ConfirmButton, EmptyState, ErrorState, Field, PageHeader, Panel, ProgramTag, RecordDialog, SimLabel, SkeletonRows, StatusPill, Tabs, inputCls, useRecordDialog, type BaseField, type MetaField } from "@/components/kit";
import { errMsg, fmtDateTime, fmtRel, mStr, useAction, type Kind } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type T = "settings" | "locations" | "staff" | "rules" | "templates" | "integrations" | "audit";

const CFG: Record<"locations" | "staff" | "rules" | "templates", { title: string; fields: BaseField[]; meta: MetaField[]; status?: string[]; titleLabel?: string; descLabel?: string }> = {
  locations: { title: "Site", titleLabel: "Site name", fields: ["status", "description"], status: ["active", "inactive"], meta: [{ key: "address", label: "Address" }, { key: "phone", label: "Phone" }], descLabel: "Notes" },
  staff: { title: "Directory entry", titleLabel: "Full name", fields: ["status"], status: ["active", "inactive"], meta: [{ key: "role", label: "Role" }, { key: "credential", label: "Credential" }, { key: "email", label: "Email" }, { key: "location", label: "Primary site" }] },
  rules: { title: "Rule", fields: ["program", "severity", "status", "description"], status: ["active", "paused", "draft"], meta: [{ key: "condition", label: "Condition expression", hint: "e.g. systolic >= 160" }, { key: "threshold", label: "Threshold", type: "number" }], descLabel: "What the rule detects" },
  templates: { title: "Template", meta: [], fields: ["program", "status", "description"], status: ["active", "draft"], descLabel: "Template body" },
};

export default function AdminPage() {
  const [tab, setTab] = useState<T>("settings");
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Practice setup" desc="Single-practice configuration. Rule and CMS-derived defaults are provisional and should be reviewed before real use." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "settings", label: "Settings" }, { id: "locations", label: "Locations" }, { id: "staff", label: "Staff" }, { id: "rules", label: "Rules" }, { id: "templates", label: "Templates" }, { id: "integrations", label: "Integrations" }, { id: "audit", label: "Audit" }]} />
      <div className="mt-5" key={tab}>
        {tab === "settings" && <SettingsTab />}
        {tab === "settings" && <PatientImport />}
        {(tab === "locations" || tab === "staff" || tab === "rules" || tab === "templates") && <RecordList kind={tab} />}
        {tab === "integrations" && <Integrations />}
        {tab === "audit" && <Audit />}
      </div>
    </div>
  );
}

function SettingsTab() {
  const q = useGetSettings();
  const upd = useUpdateSettings();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { run, pending } = useAction();
  const [v, setV] = useState<PracticeSettings | null>(null);
  const [json, setJson] = useState("");
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
  const doImport = (close: () => void) => {
    try { const payload = JSON.parse(json); run({ action: "importConfiguration", payload }, () => { setJson(""); close(); }); }
    catch { toast({ title: "Invalid JSON", description: "Paste a configuration exported from Mahalo Care.", variant: "destructive" }); }
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
      <Panel title="Configuration transfer" sub="Programs, rules, templates and sites">
        <a href="/api/exports/configuration" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3.5 text-sm font-medium hover:bg-muted" data-testid="link-export-config"><Download className="h-4 w-4" />Export configuration</a>
        <Field label="Import configuration JSON" className="mt-4"><textarea className={`${inputCls} h-32 py-2 font-mono text-xs`} value={json} onChange={(e) => setJson(e.target.value)} data-testid="input-import-json" /></Field>
        <div className="mt-2"><ConfirmButton size="md" label="Import" icon={<Upload className="h-4 w-4" />} title="Import configuration" desc="Merges the pasted configuration into this practice. Existing records with the same title are updated." confirmLabel="Import" pending={pending} disabled={!json.trim()} onConfirm={(_, c) => doImport(c)} testid="button-import" /></div>
      </Panel>
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
          {q.data.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0" data-testid={`row-${kind}-${r.id}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{r.title}<ProgramTag p={r.program} />{r.severity && <StatusPill value={r.severity} />}<StatusPill value={r.status} /></div>
                <div className="truncate text-xs text-muted-foreground">{c.meta.map((m) => mStr(r, m.key)).filter(Boolean).join(" · ")}{r.description ? ` · ${r.description}` : ""}</div>
              </div>
              {kind === "rules" && <RulePreview ruleId={r.id} title={r.title} />}
              <Btn size="sm" variant="ghost" onClick={() => dlg.edit(r)} data-testid={`button-edit-${r.id}`}><Pencil className="h-3.5 w-3.5" /></Btn>
            </div>
          ))}
        </div>
      )}
      <RecordDialog open={dlg.open} onOpenChange={dlg.onOpenChange} kind={kind} record={dlg.record} title={dlg.record ? `Edit ${c.title.toLowerCase()}` : `New ${c.title.toLowerCase()}`} fields={c.fields} meta={c.meta} statusOptions={c.status} titleLabel={c.titleLabel} descLabel={c.descLabel} />
    </>
  );
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
        {list.slice(0, 300).map((a) => (
          <div key={a.id} className="grid grid-cols-[130px_1fr] gap-3 border-b border-border px-4 py-2 last:border-b-0 sm:grid-cols-[140px_140px_1fr_160px]" data-testid={`row-audit-${a.id}`}>
            <span className="text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
            <span className="truncate">{a.assignee ?? "system"}</span>
            <span className="truncate font-sans text-[13px]">{a.title}{a.description ? <span className="text-muted-foreground"> · {a.description}</span> : null}</span>
            <span className="hidden truncate text-muted-foreground sm:block">{a.patientName}</span>
          </div>
        ))}
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

function PatientImport() {
  const { run, pending } = useAction();
  const { toast } = useToast();
  const [csv, setCsv] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [report, setReport] = useState<{ text: string; result: ActionResult } | null>(null);
  const meta = (report?.result.record?.metadata ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof meta[k] === "number" ? (meta[k] as number) : 0);
  const errors = Array.isArray(meta.errors) ? (meta.errors as { row: number; message: string }[]) : [];
  const validated = !!report && report.text === csv && meta.dryRun !== false && errors.length === 0 && n("newRows") > 0;
  const onFile = (f?: File) => {
    if (!f) return;
    f.text().then((t) => { setCsv(t); setReport(null); }).catch(() => toast({ title: "Could not read file", variant: "destructive" }));
  };
  const exec = (dryRun: boolean) =>
    run({ action: "importPatients", payload: { csv, dryRun, syntheticConfirmed: true } }, (r) => setReport(dryRun ? { text: csv, result: r } : null), { always: dryRun });
  return (
    <Panel title="Import synthetic patients (CSV)" sub="Demo data only. Never upload production or real patient data." className="mt-5">
      <p className="mb-3 text-xs text-muted-foreground">Required headers: <span className="font-mono">firstName, lastName, dob, location</span>. Optional: <span className="font-mono">email, phone, conditions, medications, payer, careManager, mrn</span>. Separate multiple conditions or medications with <span className="font-mono">|</span>.</p>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-xs" data-testid="input-import-file" />
          <textarea className={`${inputCls} h-40 py-2 font-mono text-xs`} placeholder={"firstName,lastName,dob,location\nKalani,Akana,1958-03-14,Kapiolani Clinic"} value={csv} onChange={(e) => setCsv(e.target.value)} data-testid="input-import-csv" />
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="checkbox-synthetic" />I confirm every row is synthetic and contains no real patient information.</label>
          <div className="flex gap-2">
            <Btn disabled={!csv.trim() || !confirmed || pending} onClick={() => exec(true)} data-testid="button-validate-import">Validate</Btn>
            <ConfirmButton size="md" variant="primary" label="Import" icon={<Upload className="h-4 w-4" />} title="Import synthetic patients" desc={`Creates ${n("newRows")} new synthetic patient(s). Duplicates are skipped.`} confirmLabel="Import" pending={pending} disabled={!validated || !confirmed} onConfirm={(_, c) => { exec(false); c(); }} testid="button-run-import" />
          </div>
          {report && report.text !== csv && <p className="text-[11px] text-[hsl(30_80%_38%)]">Text changed since validation. Validate again before importing.</p>}
        </div>
        <div>
          {!report ? <EmptyState title="No validation yet" desc="Validate to see row counts, duplicates and errors before anything is written." /> : (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm" data-testid="panel-import-report">
              {report.result.record?.description && <p className="mb-2 text-xs">{report.result.record.description}</p>}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[["Rows", "rowCount"], ["Valid", "validRows"], ["New", "newRows"], ["Duplicate", "duplicateRows"]].map(([l, k]) => (
                  <div key={k} className="rounded-md border border-border bg-card p-2"><div className="tnum text-lg font-semibold">{n(k)}</div><div className="text-[10px] text-muted-foreground">{l}</div></div>
                ))}
              </div>
              {errors.length > 0 && (
                <div className="mt-3 max-h-40 overflow-y-auto">
                  {errors.map((e, i) => <div key={i} className="text-xs text-destructive">Row {e.row}: {e.message}</div>)}
                </div>
              )}
              {validated && <p className="mt-3 text-xs text-[hsl(162_60%_30%)]">Validation passed. Import is enabled for this exact text.</p>}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function NotificationOutbox() {
  const q = useListRecords("notifications");
  return (
    <Panel title="Notification outbox" sub="Captured locally. No email, SMS or push is sent." action={<SimLabel text="Console only" />} className="mt-5" bodyClass="p-0">
      {q.isLoading ? <div className="p-4"><SkeletonRows rows={3} /></div> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : !q.data?.length ? <div className="p-4"><EmptyState title="Outbox empty" desc="Patient messages and critical exceptions add captured rows here." /></div> : (
        <div className="max-h-80 overflow-y-auto">
          {[...q.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0" data-testid={`row-notification-${r.id}`}>
              <span className="w-32 text-xs text-muted-foreground">{fmtDateTime(r.createdAt)}</span>
              <span className="rounded border border-border px-1.5 font-mono text-[10px] uppercase">{mStr(r, "channel") || "console"}</span>
              <span className="min-w-0 flex-1 truncate">{r.title}{r.patientName ? <span className="text-muted-foreground"> · {r.patientName}</span> : null}</span>
              <StatusPill value={r.status} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
