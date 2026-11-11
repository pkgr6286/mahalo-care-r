import {jsonFetch as sharedJsonFetch} from "@/lib/http";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, Clock3, Cpu, Inbox, Play, RotateCw, Send, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  useListJobs, getListJobsQueryKey, useEnqueueMaintenance, useRetryJob, useListIngestInbox, getListIngestInboxQueryKey,
  useSimulateDeviceWebhook, useListRecords, getListRecordsQueryKey, type InboxInfo, type JobInfo, type MaintenanceInputKind, type DeviceSimulationInputPattern,
} from "@workspace/api-client-react";
import { Btn, EmptyState, ErrorState, Field, Panel, Pill, SimLabel, SkeletonRows, inputCls, type Tone } from "@/components/kit";
import { FormAlert } from "@/components/auth-frame";
import { AdvancedDetails, PagedList } from "@/components/list-tools";
import { errMsg, fmtDateTime, fmtRel, mStr } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const POLL = { refetchInterval: 3000, refetchIntervalInBackground: false, refetchOnWindowFocus: true } as const;

const MAINT: { kind: MaintenanceInputKind; label: string; desc: string }[] = [
  { kind: "rule_sweep", label: "Rule sweep", desc: "Re-evaluate active rules against recent readings." },
  { kind: "task_materialize", label: "Materialize tasks", desc: "Create due tasks from care plans and cadences." },
  { kind: "notifications", label: "Notification outbox", desc: "Process queued local notifications." },
];
const PATTERNS: { v: DeviceSimulationInputPattern; label: string; desc: string }[] = [
  { v: "normal", label: "Normal", desc: "In-range reading" },
  { v: "critical", label: "Critical", desc: "Should raise an exception" },
  { v: "invalid", label: "Invalid reading", desc: "500 mmHg; signed, kept as invalid observation" },
];

function statusTone(s: string): Tone {
  const v = s.toLowerCase();
  if (["failed", "rejected", "error", "invalid", "dead"].includes(v)) return "red";
  if (["running", "processing", "retrying", "retry"].includes(v)) return "amber";
  if (["succeeded", "completed", "done", "processed"].includes(v)) return "green";
  if (["queued", "pending", "received", "retry_scheduled"].includes(v)) return "teal";
  return "neutral";
}
const isSettled = (s: string) => ["succeeded", "completed", "done", "processed", "failed", "rejected", "error", "dead"].includes(s.toLowerCase());
const kindLabel = (k: string) => MAINT.find((m) => m.kind === k)?.label ?? k.replace(/_/g, " ");

export function OperationsTab() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-xs text-muted-foreground" data-testid="note-operations">
        <Activity className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--brand-cyan))]" strokeWidth={1.6} />
        <span>The background worker runs rule checks, task creation and notifications automatically. Nothing here is part of daily clinical work; use it to check for failures and retry them.</span>
      </div>
      <IngestInbox />
      <Jobs />
      <AdvancedDetails label="Simulator and demonstration tools" testid="details-ops-tools">
        <div className="space-y-5 py-2">
          <DeviceSimulator />
          <DemonstrationPrep />
        </div>
      </AdvancedDetails>
    </div>
  );
}

function Jobs() {
  const q = useListJobs({ query: { queryKey: getListJobsQueryKey(), ...POLL } });
  const enqueue = useEnqueueMaintenance();
  const retry = useRetryJob();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pendingKind, setPendingKind] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const run = (kind: MaintenanceInputKind) => {
    setPendingKind(kind);
    enqueue.mutate({ data: { kind } }, {
      onSuccess: (j) => { qc.invalidateQueries({ queryKey: getListJobsQueryKey() }); toast({ title: `${kindLabel(kind)} queued`, description: `Job ${j.id.slice(0, 8)} will run shortly.` }); },
      onError: (err) => toast({ title: "Could not queue job", description: errMsg(err), variant: "destructive" }),
      onSettled: () => setPendingKind(null),
    });
  };
  const doRetry = (j: JobInfo) => {
    setRetrying(j.id);
    retry.mutate({ jobId: j.id }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListJobsQueryKey() }); toast({ title: "Retry queued" }); },
      onError: (err) => toast({ title: "Retry failed", description: errMsg(err), variant: "destructive" }),
      onSettled: () => setRetrying(null),
    });
  };
  const all = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [q.data]);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const failedCount = all.filter((j) => j.status.toLowerCase() === "failed").length;
  useEffect(() => { if (failedCount > 0) setShowHistory(true); }, [failedCount]);
  const activeCount = all.filter((j) => !isSettled(j.status)).length;
  const jobs = onlyFailed ? all.filter((j) => j.status.toLowerCase() === "failed") : all;
  return (
    <Panel title={<span className="inline-flex items-center gap-2"><Cpu className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Background jobs</span>} sub="Runs automatically on schedule" action={<LiveDot fetching={q.isFetching} />} bodyClass="p-0">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-4 py-3 text-xs" data-testid="summary-jobs">
        <span><span className="tnum font-semibold">{all.length}</span> <span className="text-muted-foreground">recent jobs</span></span>
        <span><span className="tnum font-semibold">{activeCount}</span> <span className="text-muted-foreground">queued or running</span></span>
        <span className={cn(failedCount && "text-destructive")}><span className="tnum font-semibold">{failedCount}</span> failed</span>
        <label className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--brand-orange))]" checked={onlyFailed} onChange={(e) => { setOnlyFailed(e.target.checked); setShowHistory(true); }} data-testid="filter-jobs-failed" />Failed only</label>
      </div>
      <div className="border-b border-border p-3">
        <AdvancedDetails label="Run maintenance manually" testid="details-manual-maintenance">
          <p className="mb-2 text-muted-foreground">Only needed after a failure or for troubleshooting. Queued means accepted, not finished.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {MAINT.map((m) => (
              <button key={m.kind} onClick={() => run(m.kind)} disabled={!!pendingKind} className="flex flex-col items-start rounded-lg border border-border bg-card p-2.5 text-left transition-colors hover:border-[hsl(var(--brand-orange))]/50 disabled:opacity-50" data-testid={`button-enqueue-${m.kind}`}>
                <span className="flex items-center gap-1.5 text-[13px] font-medium">{pendingKind === m.kind ? <Clock3 className="h-3.5 w-3.5 pulse-dot" strokeWidth={1.6} /> : <Play className="h-3.5 w-3.5 text-[hsl(var(--brand-orange))]" strokeWidth={1.6} />}{m.label}</span>
                <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{m.desc}</span>
              </button>
            ))}
          </div>
        </AdvancedDetails>
      </div>
      {q.isLoading ? <div className="p-4"><SkeletonRows rows={4} /></div> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : (
        <details open={showHistory} onToggle={e=>setShowHistory(e.currentTarget.open)} data-testid="details-job-history">
          <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-muted-foreground">View recent job history</summary>
          {!jobs.length ? <div className="p-4"><EmptyState title={onlyFailed ? "No failed jobs" : "No jobs yet"} desc={onlyFailed ? "No failed jobs in the loaded history." : "Scheduled and manual runs appear here."} icon={<Cpu className="h-4 w-4" strokeWidth={1.6} />} /></div> : (
        <ul aria-live="polite">
          <PagedList items={jobs} pageSize={10} noun="jobs" testid="pager-jobs" render={(j) => {
            const failed = j.status.toLowerCase() === "failed";
            const summary = typeof j.result?.message === "string" ? j.result.message : Object.entries(j.result ?? {}).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k} ${v}`).join(" · ");
            return (
              <li key={j.id} className="border-b border-border px-4 py-2.5" data-testid={`row-job-${j.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{kindLabel(j.kind)}</span>
                  <span data-testid={`status-job-${j.id}`}><Pill tone={statusTone(j.status)} dot>{j.status}</Pill></span>
                  <span className="tnum text-[11px] text-muted-foreground">attempt {j.attempts}/{j.maxAttempts}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground" title={fmtDateTime(j.createdAt)}>{j.finishedAt ? `finished ${fmtRel(j.finishedAt)}` : `queued ${fmtRel(j.createdAt)}`}</span>
                  {failed && <Btn size="sm" disabled={retrying === j.id} onClick={() => doRetry(j)} data-testid={`button-retry-job-${j.id}`}><RotateCw className="h-3.5 w-3.5" />{retrying === j.id ? "Retrying…" : "Retry"}</Btn>}
                </div>
                {j.error && <div className="mt-1 text-xs text-destructive" data-testid={`text-job-error-${j.id}`}>{j.error}</div>}
                {!j.error && summary && <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{summary}</div>}
              </li>
            );
          }} />
        </ul>
          )}
        </details>
      )}
    </Panel>
  );
}

function DeviceSimulator() {
  const devices = useListRecords("devices", { query: { queryKey: getListRecordsQueryKey("devices") } });
  const sim = useSimulateDeviceWebhook();
  const qc = useQueryClient();
  const [deviceId, setDeviceId] = useState("");
  const [pattern, setPattern] = useState<DeviceSimulationInputPattern>("normal");
  const [last, setLast] = useState<InboxInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eligible = useMemo(() => (devices.data ?? []).filter((d) => d.program === "RPM" && ["assigned", "active"].includes((d.status ?? "").toLowerCase()) && mStr(d, "serial") && d.patientId), [devices.data]);
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    sim.mutate({ data: { deviceId, pattern } }, {
      onSuccess: (inbox) => { setLast(inbox); qc.invalidateQueries({ queryKey: getListIngestInboxQueryKey() }); qc.invalidateQueries({ queryKey: getListJobsQueryKey() }); },
      onError: (err) => setError(errMsg(err)),
    });
  };
  const inbox = useListIngestInbox({ query: { queryKey: getListIngestInboxQueryKey(), ...POLL } });
  const live = last ? inbox.data?.find((i) => i.id === last.id) ?? last : null;
  return (
    <Panel title={<span className="inline-flex items-center gap-2"><Send className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Device webhook simulator</span>} sub="Send a test reading into the inbox" action={<SimLabel />}>
      {devices.isLoading ? <SkeletonRows rows={3} /> : devices.isError ? <ErrorState error={devices.error} onRetry={() => devices.refetch()} /> : !eligible.length ? (
        <EmptyState title="No eligible devices" desc="Assign an active RPM device with a serial number to a patient first." icon={<Cpu className="h-4 w-4" strokeWidth={1.6} />} />
      ) : (
        <form onSubmit={send} className="space-y-3">
          <Field label="Device">
            <select className={inputCls} required value={deviceId} onChange={(e) => setDeviceId(e.target.value)} data-testid="select-sim-device">
              <option value="">Select assigned RPM device</option>
              {eligible.map((d) => <option key={d.id} value={d.id}>{d.title} · {mStr(d, "serial")} · {d.patientName}</option>)}
            </select>
          </Field>
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-foreground/80">Reading pattern</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup">
              {PATTERNS.map((p) => (
                <label key={p.v} className={cn("cursor-pointer rounded-xl border px-3 py-2 transition-colors", pattern === p.v ? "border-[hsl(var(--brand-orange))]/60 bg-accent/60" : "border-border hover:bg-secondary")}>
                  <input type="radio" name="pattern" className="sr-only" checked={pattern === p.v} onChange={() => setPattern(p.v)} data-testid={`radio-pattern-${p.v}`} />
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{p.desc}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && <FormAlert testid="text-sim-error">{error}</FormAlert>}
          <Btn type="submit" variant="primary" disabled={!deviceId || sim.isPending} data-testid="button-simulate-webhook">{sim.isPending ? "Sending…" : "Send synthetic webhook"}</Btn>
        </form>
      )}
      {live && (
        <div className="fade-in mt-4 rounded-xl border border-border bg-secondary/50 p-3 text-xs" data-testid="panel-sim-result" aria-live="polite">
          <div className="flex items-center gap-2">
            {isSettled(live.status) ? <CheckCircle2 className="h-4 w-4 text-[hsl(162_60%_34%)]" strokeWidth={1.6} /> : <Clock3 className="h-4 w-4 pulse-dot text-[hsl(var(--brand-cyan))]" strokeWidth={1.6} />}
            <span className="font-medium">{isSettled(live.status) ? "Processing finished" : "Accepted and queued (202). Normalizing in the background."}</span>
            <span className="ml-auto"><Pill tone={statusTone(live.status)} dot>{live.status}</Pill></span>
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-muted-foreground">event {live.eventId}</div>
          {live.error && <div className="mt-1 text-destructive">{live.error}</div>}
        </div>
      )}
    </Panel>
  );
}

function IngestInbox() {
  const q = useListIngestInbox({ query: { queryKey: getListIngestInboxQueryKey(), ...POLL } });
  const qc = useQueryClient();
  const seen = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!q.data) return;
    const prev = seen.current;
    const next = new Map(q.data.map((i) => [i.id, i.status]));
    seen.current = next;
    if (!prev) return;
    const changed = q.data.some((i) => isSettled(i.status) && prev.get(i.id) !== i.status);
    if (changed) {
      qc.invalidateQueries({ predicate: (query) => { const k = query.queryKey[0]; return typeof k === "string" && (k.startsWith("/api/patients") || k.startsWith("/api/records") || k.startsWith("/api/dashboard")); } });
      qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
    }
  }, [q.data, qc]);
  const all = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)), [q.data]);
  const [filter, setFilter] = useState<"all" | "problems" | "waiting" | "processed">("all");
  const isProblem = (i: InboxInfo) => statusTone(i.status) === "red" || !i.signatureValid || !!i.error;
  const counts = {
    all: all.length,
    problems: all.filter(isProblem).length,
    waiting: all.filter((i) => !isSettled(i.status)).length,
    processed: all.filter((i) => statusTone(i.status) === "green" && !isProblem(i)).length,
  };
  const list = all.filter((i) => filter === "all" ? true : filter === "problems" ? isProblem(i) : filter === "waiting" ? !isSettled(i.status) : statusTone(i.status) === "green" && !isProblem(i));
  const FILTERS = [["all", "All"], ["problems", "Needs attention"], ["waiting", "Waiting"], ["processed", "Processed"]] as const;
  return (
    <Panel title={<span className="inline-flex items-center gap-2"><Inbox className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Device reading inbox</span>} sub="Readings reach charts after processing" action={<LiveDot fetching={q.isFetching} />} bodyClass="p-0">
      {q.isLoading ? <div className="p-4"><SkeletonRows rows={4} /></div> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : !all.length ? <div className="p-4"><EmptyState title="Inbox empty" desc="Device readings appear here before they are processed into charts." icon={<Inbox className="h-4 w-4" strokeWidth={1.6} />} /></div> : (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3" role="tablist" aria-label="Inbox filter">
            {FILTERS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} className={cn("rounded-full border px-3 py-1 text-xs transition-colors", filter === id ? "border-[hsl(var(--brand-charcoal))] bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))]" : "border-border text-muted-foreground hover:text-foreground", id === "problems" && counts.problems > 0 && filter !== id && "text-destructive")} data-testid={`filter-inbox-${id}`}>
                {label} <span className="tnum opacity-70">{counts[id]}</span>
              </button>
            ))}
          </div>
          {!list.length ? <div className="p-4"><EmptyState title="Nothing in this view" desc="Try another filter." icon={<Inbox className="h-4 w-4" strokeWidth={1.6} />} /></div> : (
            <ul>
              <PagedList items={list} pageSize={10} noun="readings" testid="pager-inbox" render={(i) => (
                <li key={i.id} className="border-b border-border px-4 py-2.5" data-testid={`row-inbox-${i.id}`}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{i.source}</span>
                    <span data-testid={`status-inbox-${i.id}`}><Pill tone={statusTone(i.status)} dot>{i.status}</Pill></span>
                    {!i.signatureValid && <span className="inline-flex items-center gap-1 text-xs text-destructive"><ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.6} />Signature invalid</span>}
                    <span className="ml-auto text-[11px] text-muted-foreground" title={fmtDateTime(i.receivedAt)}>received {fmtRel(i.receivedAt)}{i.processedAt ? `, processed ${fmtRel(i.processedAt)}` : ["received","queued","processing"].includes(i.status) ? ", waiting" : ""}</span>
                  </div>
                  {i.error && <div className="mt-1 text-xs text-destructive">{i.error}</div>}
                  <details className="mt-1 text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer select-none hover:text-foreground">Details</summary>
                    <div className="mt-1 grid gap-0.5 font-mono">
                      <span>event {i.eventId}</span><span>device {i.deviceId}</span>
                      <span className="inline-flex items-center gap-1">{i.signatureValid ? <ShieldCheck className="h-3 w-3" strokeWidth={1.6} /> : <ShieldAlert className="h-3 w-3" strokeWidth={1.6} />}signature {i.signatureValid ? "valid" : "invalid"}</span>
                    </div>
                  </details>
                </li>
              )} />
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

function LiveDot({ fetching }: { fetching: boolean }) {
  return <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className={cn("h-1.5 w-1.5 rounded-full bg-[hsl(162_60%_36%)]", fetching && "pulse-dot")} />Live</span>;
}

/* ---------- Practice demonstration preparation (admin only, synthetic) ---------- */
type DemoStatus = { prepared: boolean; patients: number; documentsPending: boolean; synthetic: true; preparing?: boolean; error?: string | null };
const DEMO_PHRASE = "PREPARE SYNTHETIC PRACTICE";
const DEMO_KEY = ["/api/operations/demonstration-status"];
async function opsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return sharedJsonFetch<T>(path,init);
}

function DemonstrationPrep() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const st = useQuery({ queryKey: DEMO_KEY, queryFn: () => opsFetch<DemoStatus>("/operations/demonstration-status"), retry: false, refetchIntervalInBackground: false, refetchInterval: (q) => (q.state.data?.preparing || q.state.data?.documentsPending ? 4000 : false) });
  const wasBusy = useRef(false);
  const busyNow = !!(st.data?.preparing || st.data?.documentsPending);
  useEffect(() => {
    if (wasBusy.current && !busyNow && st.data) {
      qc.invalidateQueries();
      if (!st.data.error) toast({ title: "Practice demonstration ready", description: `${st.data.patients} synthetic patients and their documents are available.` });
    }
    wasBusy.current = busyNow;
  }, [busyNow, st.data, qc, toast]);
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const prep = useMutation({
    mutationFn: () => opsFetch<unknown>("/operations/prepare-demonstration", { method: "POST", body: JSON.stringify({ confirmation: DEMO_PHRASE }) }),
    onSuccess: () => {
      wasBusy.current = true;
      qc.invalidateQueries({ queryKey: DEMO_KEY });
      setOpen(false); setPhrase("");
      toast({ title: "Preparation queued", description: "Runs in the background. Status updates here as it progresses." });
    },
    onError: (e) => toast({ title: "Could not prepare demonstration", description: errMsg(e), variant: "destructive" }),
  });
  const d = st.data;
  return (
    <Panel title={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Practice demonstration</span>} sub="Load a sample practice for walkthroughs" action={<SimLabel text="Sample data" />}>
      {st.isLoading ? <SkeletonRows rows={2} /> : st.isError ? <ErrorState error={st.error} onRetry={() => st.refetch()} /> : (
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-start">
          <div className="grid flex-1 grid-cols-3 gap-3 text-sm" data-testid="status-demonstration">
            <div><div className="text-[11px] text-muted-foreground">Status</div>{d?.preparing ? <Pill tone="amber">Preparing</Pill> : d?.error ? <Pill tone="red">Failed</Pill> : d?.prepared ? <Pill tone="green">Prepared</Pill> : <Pill tone="neutral">Not prepared</Pill>}</div>
            <div><div className="text-[11px] text-muted-foreground">Synthetic patients</div><div className="tnum font-semibold">{d?.patients ?? 0}</div></div>
            <div><div className="text-[11px] text-muted-foreground">Documents</div><div className="text-[13px]">{d?.preparing ? <span className="text-muted-foreground">Waiting for preparation</span> : !d?.prepared ? <span className="text-muted-foreground">None yet</span> : d?.documentsPending ? <span className="inline-flex items-center gap-1 text-[hsl(30_70%_32%)]"><Clock3 className="h-3.5 w-3.5" strokeWidth={1.6} />Still generating</span> : <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-[hsl(162_55%_35%)]" strokeWidth={1.6} />Ready</span>}</div></div>
          </div>
          {d?.error && !d.preparing && <p role="alert" className="text-xs text-destructive lg:order-last lg:basis-full" data-testid="text-demo-error">Last run failed: {d.error}</p>}
          {!open ? (
            <Btn disabled={!!d?.preparing || prep.isPending} onClick={() => setOpen(true)} data-testid="button-open-prepare-demo"><Play className="h-3.5 w-3.5" />{d?.preparing ? "Preparing…" : d?.error ? "Try again" : d?.prepared ? "Prepare again" : "Prepare demonstration"}</Btn>
          ) : (
            <div className="w-full space-y-3 rounded-xl border border-[hsl(38_80%_80%)] bg-[hsl(38_95%_97%)] p-4 text-xs lg:max-w-md" data-testid="panel-prepare-demo">
              <div className="flex gap-2 font-medium text-[hsl(30_70%_26%)]"><ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={1.6} />Before you continue</div>
              <ul className="list-disc space-y-1 pl-5 text-foreground/80">
                <li>Existing histories are retained: nothing is deleted, and audit trails stay intact.</li>
                <li>Earlier demo fixtures are separated from the prepared practice so they do not mix into its worklists and reports.</li>
                <li>Running it again is safe; it does not create duplicates.</li>
                <li>Only synthetic patients are created. Do not enter real patient information.</li>
              </ul>
              <Field label={`Type ${DEMO_PHRASE} to confirm`}><input className={inputCls} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} data-testid="input-prepare-demo-confirm" /></Field>
              <div className="flex justify-end gap-2">
                <Btn variant="ghost" onClick={() => { setOpen(false); setPhrase(""); }} disabled={prep.isPending}>Cancel</Btn>
                <Btn variant="primary" disabled={phrase.trim() !== DEMO_PHRASE || prep.isPending} onClick={() => prep.mutate()} data-testid="button-prepare-demo">{prep.isPending ? <><RotateCw className="h-3.5 w-3.5 animate-spin" />Preparing</> : "Prepare synthetic practice"}</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
