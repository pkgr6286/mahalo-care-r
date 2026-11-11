import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, Clock3, Cpu, Inbox, Play, RotateCw, Send, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  useListJobs, getListJobsQueryKey, useEnqueueMaintenance, useRetryJob, useListIngestInbox, getListIngestInboxQueryKey,
  useSimulateDeviceWebhook, useListRecords, getListRecordsQueryKey, type InboxInfo, type JobInfo, type MaintenanceInputKind, type DeviceSimulationInputPattern,
} from "@workspace/api-client-react";
import { Btn, EmptyState, ErrorState, Field, Panel, Pill, SimLabel, SkeletonRows, inputCls, type Tone } from "@/components/kit";
import { FormAlert } from "@/components/auth-frame";
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
        <span>Background work runs asynchronously. Queued means accepted, not finished. Lists refresh every few seconds while this tab is visible.</span>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Jobs />
        <DeviceSimulator />
      </div>
      <IngestInbox />
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
  const jobs = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40), [q.data]);
  return (
    <Panel title={<span className="inline-flex items-center gap-2"><Cpu className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Maintenance jobs</span>} sub="Queue a run, then watch it settle" action={<LiveDot fetching={q.isFetching} />} bodyClass="p-0">
      <div className="grid gap-2 border-b border-border p-4 sm:grid-cols-3">
        {MAINT.map((m) => (
          <button key={m.kind} onClick={() => run(m.kind)} disabled={!!pendingKind} className="lift group flex flex-col items-start rounded-xl border border-border bg-card p-3 text-left disabled:opacity-50" data-testid={`button-enqueue-${m.kind}`}>
            <span className="flex w-full items-center gap-1.5 text-sm font-medium">{pendingKind === m.kind ? <Clock3 className="h-3.5 w-3.5 pulse-dot" strokeWidth={1.6} /> : <Play className="h-3.5 w-3.5 text-[hsl(var(--brand-orange))]" strokeWidth={1.6} />}{m.label}</span>
            <span className="mt-1 text-[11px] leading-snug text-muted-foreground">{m.desc}</span>
          </button>
        ))}
      </div>
      {q.isLoading ? <div className="p-4"><SkeletonRows rows={4} /></div> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : !jobs.length ? <div className="p-4"><EmptyState title="No jobs yet" desc="Queued and completed maintenance runs appear here." icon={<Cpu className="h-4 w-4" strokeWidth={1.6} />} /></div> : (
        <ul className="max-h-[420px] overflow-y-auto" aria-live="polite">
          {jobs.map((j) => {
            const failed = j.status.toLowerCase() === "failed";
            const summary = typeof j.result?.message === "string" ? j.result.message : Object.entries(j.result ?? {}).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k} ${v}`).join(" · ");
            return (
              <li key={j.id} className="border-b border-border px-4 py-2.5 last:border-b-0" data-testid={`row-job-${j.id}`}>
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
          })}
        </ul>
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
    <Panel title={<span className="inline-flex items-center gap-2"><Send className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Device webhook simulator</span>} sub="Synthetic signed reading into the ingest inbox" action={<SimLabel />}>
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
  const list = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, 60), [q.data]);
  return (
    <Panel title={<span className="inline-flex items-center gap-2"><Inbox className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Ingest inbox</span>} sub="Received is not processed: readings reach charts only after normalization" action={<LiveDot fetching={q.isFetching} />} bodyClass="p-0">
      {q.isLoading ? <div className="p-4"><SkeletonRows rows={4} /></div> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : !list.length ? <div className="p-4"><EmptyState title="Inbox empty" desc="Device webhooks land here before they are normalized into readings." icon={<Inbox className="h-4 w-4" strokeWidth={1.6} />} /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-border bg-secondary/40 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Received</th><th className="px-2 py-2 font-semibold">Source / event</th><th className="px-2 py-2 font-semibold">Device</th><th className="px-2 py-2 font-semibold">Signature</th><th className="px-2 py-2 font-semibold">Status</th><th className="px-4 py-2 font-semibold">Processed</th>
            </tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className="border-b border-border align-top last:border-b-0" data-testid={`row-inbox-${i.id}`}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground" title={fmtDateTime(i.receivedAt)}>{fmtRel(i.receivedAt)}</td>
                  <td className="px-2 py-2.5"><div className="text-xs font-medium">{i.source}</div><div className="max-w-[200px] truncate font-mono text-[11px] text-muted-foreground">{i.eventId}</div></td>
                  <td className="px-2 py-2.5 font-mono text-[11px]">{i.deviceId}</td>
                  <td className="px-2 py-2.5">{i.signatureValid ? <span className="inline-flex items-center gap-1 text-xs text-[hsl(162_60%_28%)]"><ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.6} />Valid</span> : <span className="inline-flex items-center gap-1 text-xs text-destructive"><ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.6} />Invalid</span>}</td>
                  <td className="px-2 py-2.5"><span data-testid={`status-inbox-${i.id}`}><Pill tone={statusTone(i.status)} dot>{i.status}</Pill></span>{i.error && <div className="mt-1 max-w-[220px] text-[11px] text-destructive">{i.error}</div>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{i.processedAt ? fmtRel(i.processedAt) : "Waiting"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function LiveDot({ fetching }: { fetching: boolean }) {
  return <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className={cn("h-1.5 w-1.5 rounded-full bg-[hsl(162_60%_36%)]", fetching && "pulse-dot")} />Live</span>;
}
