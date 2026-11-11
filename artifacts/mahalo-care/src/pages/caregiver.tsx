import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, ClipboardList, FileDown, GraduationCap, HeartHandshake, LineChart, LogOut, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { Btn, EmptyState, ErrorState, Pill, SkeletonRows, StatusPill, inputCls } from "@/components/kit";
import { Logo } from "@/components/brand";
import { downloadFile, jsonFetch } from "@/lib/http";
import { errMsg, fmtDate, fmtDateTime } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Scope = "careplans.read" | "readings.read" | "tasks.read" | "messages.read" | "messages.send" | "education.read" | "appointments.read";
type CgPatient = { id: string; firstName: string; lastName: string; dob: string; scopes: Scope[] };
type CarePlan = { id: string; title: string; status: string; description?: string | null; date?: string | null; goals?: unknown; interventions?: unknown; careTeam?: unknown };
type Detail = {
  patient: { id: string; firstName: string; lastName: string; dob: string };
  scopes: Scope[]; programs: string[];
  careplans?: CarePlan[];
  readings?: { id: string; title: string; date?: string | null; value?: number | null; unit?: string | null; status: string }[];
  tasks?: { id: string; title: string; status: string; description?: string | null; date?: string | null }[];
  messages?: { id: string; title: string; description?: string | null; date?: string | null; fromName?: string | null }[];
  education?: { id: string; title: string; body: string }[];
  appointments?: { id: string; title: string; date?: string | null; status: string; description?: string | null }[];
};

export const SCOPE_LABEL: Record<Scope, string> = { "careplans.read": "Care plans", "readings.read": "Readings", "tasks.read": "Tasks", "messages.read": "Read messages", "messages.send": "Send messages", "education.read": "Education", "appointments.read": "Appointments" };

const listKey = ["/api/caregiver/patients"];
const detailKey = (id: string) => ["/api/caregiver/patients", id];

export function CaregiverPortal({ name, onSignOut, signingOut }: { name: string; onSignOut: () => void; signingOut: boolean }) {
  const list = useQuery({ queryKey: listKey, queryFn: () => jsonFetch<{ patients: CgPatient[] }>("/caregiver/patients"), staleTime: 0, refetchOnWindowFocus: true, retry: false });
  const patients = list.data?.patients ?? [];
  const [sel, setSel] = useState<string>("");
  useEffect(() => { if (patients.length && !patients.some((p) => p.id === sel)) setSel(patients[0].id); }, [patients, sel]);

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-5 py-3">
          <Logo height={24} />
          <span className="hidden text-xs text-muted-foreground sm:inline">Family caregiver access</span>
          <span className="ml-auto truncate text-xs text-muted-foreground">{name}</span>
          <Btn size="sm" variant="ghost" onClick={onSignOut} disabled={signingOut} data-testid="button-caregiver-signout"><LogOut className="h-3.5 w-3.5" />Sign out</Btn>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-6">
        {list.isLoading ? <SkeletonRows rows={5} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !patients.length ? (
          <div className="rise mx-auto mt-8 max-w-md rounded-2xl border border-card-border bg-card p-8 text-center" data-testid="state-caregiver-no-access">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary text-[hsl(var(--brand-orange))]"><HeartHandshake className="h-5 w-5" strokeWidth={1.6} /></div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">No shared records yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">Access appears here once the care team records the patient's permission to share with you. If you expected access, contact the practice.</p>
          </div>
        ) : (
          <>
            {patients.length > 1 && (
              <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Choose a person">
                {patients.map((p) => (
                  <button key={p.id} role="tab" aria-selected={sel === p.id} onClick={() => setSel(p.id)} className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", sel === p.id ? "border-[hsl(var(--brand-charcoal))] bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))]" : "border-border bg-card hover:bg-secondary")} data-testid={`tab-caregiver-patient-${p.id}`}>{p.firstName} {p.lastName}</button>
                ))}
              </div>
            )}
            {sel && <PatientView key={sel} id={sel} />}
          </>
        )}
      </main>
    </div>
  );
}

function PatientView({ id }: { id: string }) {
  const {toast}=useToast();
  const download=useMutation({mutationFn:(recordId:string)=>downloadFile(`/caregiver/patients/${encodeURIComponent(id)}/careplans/${encodeURIComponent(recordId)}/pdf`,"shared-care-plan.pdf"),onError:(error)=>toast({title:"Could not download care plan",description:error instanceof Error?error.message:"Please try again.",variant:"destructive"})});
  const q = useQuery({ queryKey: detailKey(id), queryFn: () => jsonFetch<Detail>(`/caregiver/patients/${encodeURIComponent(id)}`), staleTime: 0, refetchOnWindowFocus: true, retry: false });
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.isError) {
    const st = (q.error as { status?: number }).status;
    if (st === 403 || st === 404) return <EmptyState icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.6} />} title="Access is no longer active" desc="Sharing for this person was withdrawn, expired or is unavailable. Contact the practice if this seems wrong." />;
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  }
  const d = q.data!;
  const has = (s: Scope) => d.scopes.includes(s);
  const none = !d.scopes.some((s) => s !== "messages.send");
  return (
    <div className="space-y-5">
      <section className="rise rounded-2xl border border-card-border bg-card p-5">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-caregiver-patient">{d.patient.firstName} {d.patient.lastName}</h1>
        <div className="mt-1 text-xs text-muted-foreground">Born {fmtDate(d.patient.dob)}{d.programs.length ? ` · ${d.programs.join(", ")}` : ""}</div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]"><span className="text-muted-foreground">You can see:</span>{d.scopes.map((s) => <Pill key={s} tone="neutral">{SCOPE_LABEL[s] ?? s}</Pill>)}</div>
      </section>
      {none && !has("messages.send") && <EmptyState title="Nothing shared yet" desc="The care team has not shared any sections with you." />}
      {has("careplans.read") && <Section icon={ClipboardList} title="Care plans">
        {d.careplans?.length ? d.careplans.map((c) => (
          <div key={c.id} className="border-b border-border px-4 py-3 last:border-b-0">
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.title}</span><StatusPill value={c.status} />{c.date && <span className="text-xs text-muted-foreground">{fmtDate(c.date)}</span>}
              <button type="button" disabled={download.isPending} onClick={()=>download.mutate(c.id)} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50" data-testid={`link-careplan-pdf-${c.id}`}><FileDown className="h-3.5 w-3.5" strokeWidth={1.6} />{download.isPending?"Downloading…":"Download PDF"}</button></div>
            {c.description && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/85">{c.description}</p>}
            <PlanList label="Goals" v={c.goals} /><PlanList label="What the team will do" v={c.interventions} /><PlanList label="Care team" v={c.careTeam} />
          </div>
        )) : <Empty>No care plans shared.</Empty>}
      </Section>}
      {has("readings.read") && <Section icon={LineChart} title="Recent readings">
        {d.readings?.length ? d.readings.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0">
            <span className="w-36 shrink-0 text-xs text-muted-foreground">{r.date ? fmtDateTime(r.date) : ""}</span><span className="min-w-0 flex-1 truncate">{r.title}</span>
            <span className="tnum font-mono">{r.value ?? ""} <span className="text-[11px] text-muted-foreground">{r.unit}</span></span>
          </div>
        )) : <Empty>No readings shared.</Empty>}
      </Section>}
      {has("tasks.read") && <Section icon={CalendarCheck2} title="Upcoming tasks">
        {d.tasks?.length ? d.tasks.map((t) => (
          <div key={t.id} className="border-b border-border px-4 py-2.5 last:border-b-0"><div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{t.title}</span><StatusPill value={t.status} />{t.date && <span className="ml-auto text-xs text-muted-foreground">{fmtDate(t.date)}</span>}</div>{t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}</div>
        )) : <Empty>No tasks shared.</Empty>}
      </Section>}
      {(has("messages.read") || has("messages.send")) && <Section icon={MessageSquare} title="Messages with the care team">
        {has("messages.read") && (d.messages?.length ? d.messages.map((m) => (
          <div key={m.id} className="border-b border-border px-4 py-2.5 last:border-b-0"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{m.fromName ?? m.title}</span>{m.date && <span className="ml-auto">{fmtDateTime(m.date)}</span>}</div>{m.description && <p className="mt-0.5 whitespace-pre-wrap text-sm">{m.description}</p>}</div>
        )) : <Empty>No messages yet.</Empty>)}
        {has("messages.send") && <Composer id={id} />}
      </Section>}
      {has("appointments.read") && <Section icon={CalendarCheck2} title="Appointments">
        <p className="border-b border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">Video visits use the practice's local demonstration workflow, not a connected video provider.</p>
        {d.appointments?.length ? d.appointments.map((a) => (
          <div key={a.id} className="border-b border-border px-4 py-2.5 last:border-b-0"><div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{a.title}</span><StatusPill value={a.status} />{a.date && <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(a.date)}</span>}</div>{a.description && <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>}</div>
        )) : <Empty>No appointments shared.</Empty>}
      </Section>}
      {has("education.read") && <Section icon={GraduationCap} title="Education">
        {d.education?.length ? d.education.map((e) => (
          <details key={e.id} className="group border-b border-border px-4 py-2.5 last:border-b-0"><summary className="cursor-pointer text-sm font-medium">{e.title}</summary><p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/85">{e.body}</p></details>
        )) : <Empty>No education shared.</Empty>}
      </Section>}
      <p className="text-center text-[11px] text-muted-foreground">Shared with the patient's documented permission. Not for emergencies: call 911 in the US or your local emergency number.</p>
    </div>
  );
}

function Composer({ id }: { id: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [msg, setMsg] = useState("");
  const send = useMutation({
    mutationFn: () => jsonFetch<{ success: boolean }>(`/caregiver/patients/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ message: msg.trim() }) }),
    onSuccess: () => { setMsg(""); qc.invalidateQueries({ queryKey: detailKey(id) }); toast({ title: "Message sent", description: "Sent to the care team as caregiver." }); },
    onError: (e) => { if ((e as { status?: number }).status === 403) qc.invalidateQueries({ queryKey: detailKey(id) }); toast({ title: "Could not send", description: errMsg(e), variant: "destructive" }); },
  });
  return (
    <form className="border-t border-border bg-muted/30 p-3" onSubmit={(e) => { e.preventDefault(); if (msg.trim()) send.mutate(); }}>
      <label htmlFor="cg-msg" className="text-xs font-medium">Message the care team <span className="font-normal text-muted-foreground">· sent as caregiver</span></label>
      <textarea id="cg-msg" className={cn(inputCls, "mt-1 h-20 resize-y py-2")} maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} data-testid="input-caregiver-message" />
      <div className="mt-2 flex justify-end"><Btn type="submit" variant="primary" size="sm" disabled={!msg.trim() || send.isPending} data-testid="button-caregiver-send"><Send className="h-3.5 w-3.5" />{send.isPending ? "Sending…" : "Send"}</Btn></div>
    </form>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof ClipboardList; title: string; children: React.ReactNode }) {
  return <section className="rise overflow-hidden rounded-2xl border border-card-border bg-card"><h2 className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold"><Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />{title}</h2>{children}</section>;
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-3 text-xs text-muted-foreground">{children}</p>;
function PlanList({ label, v }: { label: string; v: unknown }) {
  const items = Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as Record<string, unknown>).title ?? (x as Record<string, unknown>).name ?? (x as Record<string, unknown>).text ?? "") : String(x))).filter(Boolean) : typeof v === "string" && v ? v.split("\n").filter(Boolean) : [];
  if (!items.length) return null;
  return <div className="mt-2"><div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</div><ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>;
}
