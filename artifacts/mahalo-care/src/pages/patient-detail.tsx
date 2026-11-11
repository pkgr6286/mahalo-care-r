import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Ban, ListChecks, CalendarDays, FileDown, FileSignature, FileText, Gauge, Pause, Pencil, Play, Plus, RefreshCw, Send, Sparkles, Square, Video,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  useGetPatient, useListRecords, useUpdatePatient, getListRecordsQueryKey,
  type CareRecord, type Patient,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Btn, ConfirmButton, EmptyState, ErrorState, Field, Panel, Pill, ProgramTag, RecordDialog, SimLabel, SkeletonRows, StatusPill, Tabs, inputCls, toneFor, useRecordDialog,
} from "@/components/kit";
import { ReadOnlyHint, usePermission } from "@/components/access";
import { ExceptionRow, TaskRow, isOpen } from "@/components/records";
import { DocButton } from "@/components/doc-viewer";
import { DraftLifecycle } from "@/components/draft-lifecycle";
import { DraftCard } from "@/components/ai/draft-card";
import { PatientAttachments } from "@/components/attachments/patient-attachments";
import { CarePlansSection } from "@/components/careplan-editor";
import { EhrTab } from "@/components/ehr-context";
import {EnrollmentPolicySummary,useEnrollmentPolicy} from "@/components/enrollment-policy";
import {NoteEditor} from "@/components/note-editor";
import { errMsg, fmtDate, fmtDateTime, fmtRel, initials, mBool, mNum, mStr, PROGRAMS, PROGRAM_NAMES, ACTIVITIES, activityLabel, useAction, useSaveRecord } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Tab = "timeline" | "readings" | "careplans" | "enrollment" | "notes" | "time" | "messages" | "work" | "ehr" | "files";

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useGetPatient(id);
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get("tab") === "time" ? "time" : "timeline"));

  if (q.isLoading) return <div className="space-y-4"><div className="h-28 animate-pulse rounded-xl bg-muted" /><SkeletonRows rows={6} /></div>;
  if (q.isError || !q.data) return <ErrorState error={q.error ?? new Error("Patient not found")} onRetry={() => q.refetch()} />;
  const { patient: p, records } = q.data;
  const by = (k: string) => records.filter((r) => r.kind === k);
  const openEx = by("exceptions").filter(isOpen);

  return (
    <div>
      <Link href="/patients" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="link-back"><ArrowLeft className="h-3.5 w-3.5" />Patients</Link>
      <PatientHeader p={p} records={records} />
      <Tabs
        className="mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "timeline", label: "Timeline" },
          { id: "work", label: "Exceptions & tasks", count: openEx.length + by("tasks").filter(isOpen).length },
          { id: "readings", label: "Readings", count: by("observations").length },
          { id: "careplans", label: "Care plans", count: by("careplans").length },
          { id: "enrollment", label: "Enrollment & consent" },
          { id: "notes", label: "Notes", count: by("notes").length },
          { id: "time", label: "Time", count: by("time").length },
          { id: "messages", label: "Messages & EHR", count: by("messages").length },
          { id: "ehr", label: "EHR context" },
          { id: "files", label: "Files" },
        ]}
      />
      <div className="mt-5" key={tab}>
        {tab === "timeline" && <Timeline records={records} />}
        {tab === "work" && <WorkTab p={p} ex={by("exceptions")} tasks={by("tasks")} />}
        {tab === "readings" && <ReadingsTab p={p} obs={by("observations")} devices={by("devices")} />}
        {tab === "careplans" && <CarePlansTab p={p} plans={by("careplans")} />}
        {tab === "enrollment" && <EnrollmentTab p={p} enrollments={by("enrollments")} consents={by("consents")} />}
        {tab === "notes" && <NotesTab p={p} notes={by("notes")} drafts={by("drafts")} />}
        {tab === "time" && <TimeTab p={p} time={by("time")} />}
        {tab === "messages" && <MessagesTab p={p} messages={by("messages")} interactions={by("interactions")} />}
        {tab === "ehr" && <EhrTab p={p} interactions={by("interactions")} />}
        {tab === "files" && <PatientAttachments patientId={p.id} audience="staff" />}
      </div>
    </div>
  );
}

function age(dob: string) {
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "";
  return `${Math.floor((Date.now() - d.getTime()) / 3.15576e10)}y`;
}

/* ---------------- Header ---------------- */
function PatientHeader({ p, records }: { p: Patient; records: CareRecord[] }) {
  const { allow } = usePermission();
  const running = records.find((r) => r.kind === "time" && r.status === "running");
  const [edit, setEdit] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const { run, pending } = useAction();
  return (
    <div className="rise rounded-xl border border-card-border bg-card">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-white">{initials(`${p.firstName} ${p.lastName}`)}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight" data-testid="text-patient-name">{p.firstName} {p.lastName}</h1>
              <Pill tone={toneFor(p.risk)} dot>{p.risk} risk</Pill>
              <StatusPill value={p.status} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="font-mono">{p.mrn}</span>
              <span>{fmtDate(p.dob)} · {age(p.dob)} · {p.sex}</span>
              <span>{p.location}</span>
              {p.payer && <span>{p.payer}</span>}
              {p.careManager && <span>CM {p.careManager}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.programs.map((g) => <ProgramTag key={g} p={g} />)}
              {(p.conditions ?? []).map((c) => <span key={c} className="rounded border border-border px-1.5 text-[11px] text-muted-foreground">{c}</span>)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {running ? <RunningTimer r={running} /> : allow("time.write") && <Btn variant="navy" onClick={() => setTimerOpen(true)} data-testid="button-start-timer"><Play className="h-3.5 w-3.5" />Start timer</Btn>}
          {allow("clinical.write") && <ConfirmButton size="md" label="Sync EHR" icon={<RefreshCw className="h-3.5 w-3.5" />} title="Sync with EHR (simulated)" desc="Pulls problems, medications and encounters from the simulated EHR connector. No live EHR is connected in this demo." confirmLabel="Run sync" pending={pending} onConfirm={(_, close) => run({ action: "syncEhr", patientId: p.id }, close)} testid="button-sync-ehr" />}
          {allow("clinical.write") && <ConfirmButton size="md" label="Evaluate rules" icon={<Gauge className="h-3.5 w-3.5" />} title="Evaluate rules now" desc="Runs every active rule against this patient's current readings, check-ins and contact gaps. New exceptions appear in the worklist." confirmLabel="Evaluate" pending={pending} onConfirm={(_, close) => run({ action: "evaluateRules", patientId: p.id }, close)} testid="button-evaluate-rules" />}
          {allow("clinical.write") && <ConfirmButton size="md" label="Generate tasks" icon={<ListChecks className="h-3.5 w-3.5" />} title="Generate follow-up tasks" desc="Creates tasks for missing evidence: unsigned plans, consent gaps, device days and time thresholds." confirmLabel="Generate" pending={pending} onConfirm={(_, close) => run({ action: "generateTasks", patientId: p.id }, close)} testid="button-generate-tasks" />}
          {allow("patients.write") && <Btn onClick={() => setEdit(true)} data-testid="button-edit-patient"><Pencil className="h-3.5 w-3.5" />Edit</Btn>}
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
        {[
          { l: "Minutes this month", v: p.minutes },
          { l: "Device days", v: `${p.deviceDays}/16` },
          { l: "Adherence", v: `${p.adherence}%` },
          { l: "Last contact", v: p.lastContact ? fmtRel(p.lastContact) : "No contact recorded" },
        ].map((s, i) => (
          <div key={s.l} className={cn("px-5 py-3", i > 0 && "sm:border-l border-border", i % 2 === 1 && "border-l")}>
            <div className="text-[11px] text-muted-foreground">{s.l}</div>
            <div className="tnum text-base font-semibold">{s.v}</div>
          </div>
        ))}
      </div>
      <EditPatientDialog p={p} open={edit} onOpenChange={setEdit} />
      <StartTimerDialog p={p} open={timerOpen} onOpenChange={setTimerOpen} />
    </div>
  );
}

function RunningTimer({ r }: { r: CareRecord }) {
  const { allow, user } = usePermission();
  const { run, pending } = useAction();
  const started = new Date(mStr(r, "startedAt") || r.createdAt).getTime();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - started) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-accent pl-3" data-testid="status-timer-running">
      <span className="h-2 w-2 rounded-full bg-primary pulse-dot" />
      <span className="tnum font-mono text-sm font-medium text-accent-foreground">{mm}:{ss}</span>
      <span className="text-xs text-muted-foreground">{activityLabel(mStr(r, "activity")) || r.title} · {r.program}</span>
      {allow("time.write") && mStr(r, "userId") === user?.id && <Btn variant="primary" disabled={pending} onClick={() => run({ action: "stopTimer", id: r.id })} data-testid="button-stop-timer"><Square className="h-3 w-3" />Stop</Btn>}
    </div>
  );
}

function StartTimerDialog({ p, open, onOpenChange }: { p: Patient; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [program, setProgram] = useState(p.programs[0] ?? "CCM");
  const [activity, setActivity] = useState("care_coordination");
  const { run, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Start care timer</DialogTitle><DialogDescription>Time is attributed to one program. Stop the timer to commit it as evidence.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="Program"><select className={inputCls} value={program} onChange={(e) => setProgram(e.target.value)} data-testid="select-timer-program">{(p.programs.length ? p.programs : PROGRAMS).map((g) => <option key={g} value={g}>{g}</option>)}</select></Field>
          <Field label="Activity" hint="Only eligible activity codes count toward billing"><select className={inputCls} value={activity} onChange={(e) => setActivity(e.target.value)} data-testid="select-timer-activity">{ACTIVITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select></Field>
        </div>
        <DialogFooter>
          <Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn>
          <Btn variant="primary" disabled={pending || !activity.trim()} onClick={() => run({ action: "startTimer", patientId: p.id, program, payload: { activity } }, () => onOpenChange(false))} data-testid="button-confirm-timer"><Play className="h-3.5 w-3.5" />Start</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPatientDialog({ p, open, onOpenChange }: { p: Patient; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const upd = useUpdatePatient();
  const init = () => ({
    firstName: p.firstName, lastName: p.lastName, dob: p.dob?.slice(0, 10) ?? "", sex: p.sex ?? "", email: p.email ?? "", phone: p.phone ?? "", location: p.location,
    timezone: p.timezone ?? "", status: p.status ?? "active", payer: p.payer ?? "", careManager: p.careManager ?? "",
    conditions: (p.conditions ?? []).join(", "), medications: (p.medications ?? []).join(", "),
  });
  const [v, setV] = useState(init);
  useEffect(() => { if (open) setV(init()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof ReturnType<typeof init>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    upd.mutate(
      { id: p.id, data: { ...v, conditions: v.conditions.split(",").map((s) => s.trim()).filter(Boolean), medications: v.medications.split(",").map((s) => s.trim()).filter(Boolean) } },
      {
        onSuccess: () => { qc.invalidateQueries(); toast({ title: "Patient updated" }); onOpenChange(false); },
        onError: (err) => toast({ title: "Could not update", description: errMsg(err), variant: "destructive" }),
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader><DialogTitle>Edit demographics</DialogTitle><DialogDescription>Synthetic record. Changes are audited.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><input className={inputCls} value={v.firstName} onChange={set("firstName")} required data-testid="input-edit-first" /></Field>
            <Field label="Last name"><input className={inputCls} value={v.lastName} onChange={set("lastName")} required data-testid="input-edit-last" /></Field>
            <Field label="Date of birth"><input type="date" className={inputCls} value={v.dob} onChange={set("dob")} required /></Field>
            <Field label="Status" hint="Pause or discharge individual programs in Enrollments."><select className={inputCls} value={v.status} onChange={set("status")} data-testid="select-edit-status">{["active", "inactive"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Email"><input className={inputCls} value={v.email} onChange={set("email")} /></Field>
            <Field label="Phone"><input className={inputCls} value={v.phone} onChange={set("phone")} /></Field>
            <Field label="Location"><input className={inputCls} value={v.location} onChange={set("location")} required /></Field>
            <Field label="Care manager"><input className={inputCls} value={v.careManager} onChange={set("careManager")} /></Field>
            <Field label="Payer"><input className={inputCls} value={v.payer} onChange={set("payer")} /></Field>
            <Field label="Timezone"><input className={inputCls} value={v.timezone} onChange={set("timezone")} /></Field>
          </div>
          <Field label="Conditions" hint="Comma separated"><input className={inputCls} value={v.conditions} onChange={set("conditions")} /></Field>
          <Field label="Medications" hint="Comma separated"><input className={inputCls} value={v.medications} onChange={set("medications")} /></Field>
          <DialogFooter>
            <Btn type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn>
            <Btn type="submit" variant="primary" disabled={upd.isPending} data-testid="button-save-patient">{upd.isPending ? "Saving…" : "Save"}</Btn>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Timeline ---------------- */
const kindLabel: Record<string, string> = {
  observations: "Reading", exceptions: "Exception", tasks: "Task", time: "Time", notes: "Note", messages: "Message", careplans: "Care plan", enrollments: "Enrollment",
  consents: "Consent", interactions: "Interaction", billing: "Billing", drafts: "AI draft", responses: "Check-in", devices: "Device", audit: "Audit",
};
function Timeline({ records }: { records: CareRecord[] }) {
  const [kind, setKind] = useState("");
  const sorted = useMemo(() => [...records].sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt)), [records]);
  const kinds = Array.from(new Set(records.map((r) => r.kind)));
  const list = sorted.filter((r) => (kind ? r.kind === kind : true));
  let lastDay = "";
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <button onClick={() => setKind("")} className={cn("rounded-full border px-2.5 py-1 text-xs", !kind ? "border-foreground bg-foreground text-white" : "border-border bg-card text-muted-foreground hover:text-foreground")} data-testid="filter-kind-all">All</button>
        {kinds.map((k) => <button key={k} onClick={() => setKind(k)} className={cn("rounded-full border px-2.5 py-1 text-xs", kind === k ? "border-foreground bg-foreground text-white" : "border-border bg-card text-muted-foreground hover:text-foreground")} data-testid={`filter-kind-${k}`}>{kindLabel[k] ?? k}</button>)}
      </div>
      {!list.length ? <EmptyState title="Nothing recorded yet" desc="Readings, notes, contact and time will build this patient's story." /> : (
        <div className="relative pl-6">
          <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
          {list.map((r) => {
            const day = fmtDate(r.date ?? r.createdAt, "EEEE, MMM d");
            const head = day !== lastDay;
            lastDay = day;
            return (
              <div key={r.id} className="rise">
                {head && <div className="-ml-6 mb-2 mt-4 pl-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">{day}</div>}
                <div className="relative mb-2 rounded-lg border border-border bg-card px-3.5 py-2.5" data-testid={`timeline-${r.id}`}>
                  <span className={cn("absolute -left-[22px] top-3.5 h-2.5 w-2.5 rounded-full border-2 border-background", r.kind === "exceptions" ? "bg-destructive" : r.kind === "observations" ? "bg-primary" : "bg-foreground/40")} />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kindLabel[r.kind] ?? r.kind}</span>
                    <span className="text-sm font-medium">{r.title}</span>
                    <ProgramTag p={r.program} />
                    <StatusPill value={r.status} />
                    <span className="ml-auto text-[11px] text-muted-foreground">{fmtDateTime(r.date ?? r.createdAt)}</span>
                  </div>
                  {(r.description || r.value !== undefined) && (
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {r.kind === "observations" && r.value !== undefined ? <span className="tnum font-mono text-foreground">{r.value}/{mStr(r, "diastolic")} {r.unit} </span> : r.value !== undefined ? <span className="tnum font-mono text-foreground">{r.value} {r.unit} </span> : null}
                      {r.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Work ---------------- */
function WorkTab({ p, ex, tasks }: { p: Patient; ex: CareRecord[]; tasks: CareRecord[] }) {
  const { allow } = usePermission();
  const dlg = useRecordDialog();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Exceptions" bodyClass="py-1">{ex.length ? ex.map((r) => <ExceptionRow key={r.id} r={r} showPatient={false} />) : <div className="py-3"><EmptyState title="No exceptions" /></div>}</Panel>
      <Panel title="Tasks" action={allow("clinical.write") ? <Btn size="sm" onClick={dlg.create} data-testid="button-add-task"><Plus className="h-3.5 w-3.5" />Task</Btn> : undefined} bodyClass="py-1">
        {tasks.length ? tasks.map((r) => <TaskRow key={r.id} r={r} showPatient={false} />) : <div className="py-3"><EmptyState title="No tasks" /></div>}
      </Panel>
      <RecordDialog open={dlg.open} onOpenChange={dlg.onOpenChange} kind="tasks" title="New task" fields={["program", "assignee", "date", "description"]} defaults={{ patientId: p.id, status: "open" }} />
    </div>
  );
}

/* ---------------- Readings ---------------- */
function ReadingsTab({ p, obs, devices }: { p: Patient; obs: CareRecord[]; devices: CareRecord[] }) {
  const { allow } = usePermission();
  const sorted = [...obs].sort((a, b) => (a.date ?? a.createdAt).localeCompare(b.date ?? b.createdAt));
  const data = sorted.map((r) => ({ label: fmtDate(r.date ?? r.createdAt, "MMM d"), sys: r.value, dia: mNum(r, "diastolic") }));
  const [sys, setSys] = useState("142");
  const [dia, setDia] = useState("88");
  const { run, pending } = useAction();
  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <Panel title="Blood pressure" sub="Systolic and diastolic, mmHg" action={<SimLabel text="Simulated device feed" />}>
        {data.length ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid stroke="hsl(40 12% 91%)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(220 4% 42%)" }} axisLine={false} tickLine={false} />
                <YAxis domain={[50, 200]} tick={{ fontSize: 11, fill: "hsl(220 4% 42%)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine y={140} stroke="hsl(356 72% 50%)" strokeDasharray="4 4" />
                <ReferenceLine y={90} stroke="hsl(38 90% 52%)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="sys" name="Systolic" stroke="hsl(22 88% 42%)" strokeWidth={2} dot={{ r: 2.5 }} />
                <Line type="monotone" dataKey="dia" name="Diastolic" stroke="hsl(220 5% 12%)" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyState icon={<Gauge className="h-4 w-4" />} title="No readings" desc="Send a simulated reading to see rules evaluate it." />}
      </Panel>
      <div className="space-y-5">
        <Panel title="Send a simulated reading" sub="Runs through the same exception rules as device data">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Systolic"><input type="number" className={inputCls} value={sys} onChange={(e) => setSys(e.target.value)} data-testid="input-systolic" /></Field>
            <Field label="Diastolic"><input type="number" className={inputCls} value={dia} onChange={(e) => setDia(e.target.value)} data-testid="input-diastolic" /></Field>
          </div>
          {allow("devices.write") ? <Btn variant="primary" className="mt-3 w-full" disabled={pending || !sys || !dia} onClick={() => run({ action: "simulateReading", patientId: p.id, program: "RPM", payload: { systolic: Number(sys), diastolic: Number(dia) } })} data-testid="button-simulate-reading">Submit reading</Btn> : <p className="mt-3 text-xs text-muted-foreground" data-testid="hint-no-simulate">Sending readings needs device access.</p>}
        </Panel>
        <Panel title="Devices">
          {devices.length ? devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-1.5 text-sm"><span>{d.title}<span className="ml-2 text-xs text-muted-foreground">{mStr(d, "serial")}</span></span><StatusPill value={d.status} /></div>
          )) : <p className="text-xs text-muted-foreground">No devices assigned. Assign from the Devices page.</p>}
        </Panel>
      </div>
      <Panel title="Reading log" className="lg:col-span-2" bodyClass="p-0">
        <div className="max-h-80 overflow-y-auto">
          {[...sorted].reverse().map((r) => (
            <div key={r.id} className="flex items-center gap-4 border-b border-border px-4 py-2 text-sm last:border-b-0" data-testid={`row-reading-${r.id}`}>
              <span className="w-32 text-xs text-muted-foreground">{fmtDateTime(r.date ?? r.createdAt)}</span>
              <span className={cn("tnum w-24 font-mono", (r.value ?? 0) >= 160 && "font-semibold text-destructive")}>{r.value}/{mStr(r, "diastolic")}</span>
              <span className="text-xs text-muted-foreground">{mStr(r, "source") || "device"}</span>
              {r.metadata?.valid === false && <Pill tone="amber">invalid</Pill>}
              <span className="ml-auto"><StatusPill value={r.status} /></span>
            </div>
          ))}
          {!sorted.length && <p className="p-4 text-xs text-muted-foreground">No readings logged.</p>}
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- Care plans ---------------- */
function CarePlansTab({ p, plans }: { p: Patient; plans: CareRecord[] }) {
  return <CarePlansSection p={p} plans={plans} />;
}

/* ---------------- Enrollment ---------------- */
function EnrollmentTab({ p, enrollments, consents }: { p: Patient; enrollments: CareRecord[]; consents: CareRecord[] }) {
  const { allow } = usePermission();
  const [open, setOpen] = useState(false);
  const { run, pending } = useAction();
  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <Panel title="Program enrollments" action={allow("clinical.write") ? <Btn size="sm" variant="primary" onClick={() => setOpen(true)} data-testid="button-enroll"><Plus className="h-3.5 w-3.5" />Enroll</Btn> : undefined} bodyClass="p-0">
        {enrollments.length ? enrollments.map((e) => (
          <div key={e.id} className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center" data-testid={`row-enrollment-${e.id}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium"><ProgramTag p={e.program} />{PROGRAM_NAMES[e.program ?? ""] ?? e.title}<StatusPill value={e.status} /></div>
              <div className="text-xs text-muted-foreground">Since {fmtDate(e.date ?? e.createdAt)}{mStr(e, "billingProvider") && ` · Billing ${mStr(e, "billingProvider")}`}{mStr(e, "condition") && ` · ${mStr(e, "condition")}`}</div>
            </div>
            {allow("clinical.write") && e.status === "active" && (
              <div className="flex gap-1.5">
                <ConfirmButton label="Pause" icon={<Pause className="h-3.5 w-3.5" />} title={`Pause ${e.program}`} desc="Paused enrollments stop accruing billable time until resumed." confirmLabel="Pause" pending={pending} onConfirm={(_, close) => run({ action: "pauseEnrollment", id: e.id }, close)} testid={`button-pause-${e.id}`} />
                <ConfirmButton label="Discharge" icon={<Ban className="h-3.5 w-3.5" />} variant="danger" title={`Discharge from ${e.program}`} desc="The patient leaves this program. Open work for the program will close." reason confirmLabel="Discharge" pending={pending} onConfirm={(reason, close) => run({ action: "discharge", id: e.id, reason }, close)} testid={`button-discharge-${e.id}`} />
              </div>
            )}
          </div>
        )) : <div className="p-4"><EmptyState title="Not enrolled" desc="Enrollment captures consent and starts evidence collection." /></div>}
      </Panel>
      <Panel title="Consents" sub="Captured at enrollment">
        {consents.length ? consents.map((c) => (
          <div key={c.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-b-0" data-testid={`row-consent-${c.id}`}>
            <div><div className="flex items-center gap-2">{c.title}<ProgramTag p={c.program} /></div><div className="text-xs text-muted-foreground">{fmtDate(c.date ?? c.createdAt)} · {mStr(c, "method") || "verbal"}</div></div>
            <div className="flex items-center gap-1.5"><StatusPill value={c.status} /><DocButton r={c} />{allow("clinical.write") && !["revoked", "withdrawn"].includes(c.status) && <ConfirmButton label="Revoke" variant="danger" title="Revoke consent" desc="Revoking stops billable activity under this consent. The patient's enrollment for this program will need new consent." reason confirmLabel="Revoke consent" pending={pending} onConfirm={(reason, close) => run({ action: "revokeConsent", id: c.id, reason }, close)} testid={`button-revoke-${c.id}`} />}</div>
          </div>
        )) : <p className="text-xs text-muted-foreground">No consents on file.</p>}
      </Panel>
      <EnrollDialog p={p} open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function EnrollDialog({ p, open, onOpenChange }: { p: Patient; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [program, setProgram] = useState<string>(PROGRAMS.find((g) => !p.programs.includes(g)) ?? "RPM");
  const [condition, setCondition] = useState(p.conditions?.[0] ?? "");
  const [provider, setProvider] = useState("");
  const [consent, setConsent] = useState(false);
  const [consentMethod, setConsentMethod] = useState<"verbal" | "written" | "electronic">("verbal");
  const [variant, setVariant] = useState("msk");
  const [deviceSharing,setDeviceSharing]=useState(false);
  const [conditionMonths,setConditionMonths]=useState("");
  const [initiatingVisit,setInitiatingVisit]=useState("");
  const policy=useEnrollmentPolicy(program,open);
  useEffect(()=>{setConsent(false);setDeviceSharing(false);},[program,policy.selected?.id]);
  const { run, pending } = useAction();
  const staff = useListRecords("staff", { query: { enabled: open, queryKey: getListRecordsQueryKey("staff") } });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>Enroll {p.firstName} in a program</DialogTitle><DialogDescription>Consent must be documented before enrollment is accepted.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="Program"><select className={inputCls} value={program} onChange={(e) => setProgram(e.target.value)} data-testid="select-enroll-program">{PROGRAMS.map((g) => <option key={g} value={g} disabled={p.programs.includes(g)}>{g} · {PROGRAM_NAMES[g]}</option>)}</select></Field>
          <Field label="Qualifying condition"><input className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value)} data-testid="input-enroll-condition" /></Field>
          {(program==="PCM"||policy.conditionMonths>0)&&<Field label="Qualifying condition duration" hint={policy.conditionMonths?`At least ${policy.conditionMonths} months required by this policy`:"Months of the qualifying condition"}><input type="number" min={1} className={inputCls} value={conditionMonths} onChange={e=>setConditionMonths(e.target.value)} data-testid="input-condition-months"/></Field>}
          <Field label="Initiating visit date" hint={policy.visitMonths?`Required within ${policy.visitMonths} months`:"Optional unless required by the selected policy"}><input type="date" max={new Date().toISOString().slice(0,10)} className={inputCls} value={initiatingVisit} onChange={e=>setInitiatingVisit(e.target.value)} data-testid="input-initiating-visit"/></Field>
          {program === "RTM" && <Field label="Therapeutic data stream"><select className={inputCls} value={variant} onChange={e=>setVariant(e.target.value)} data-testid="select-rtm-variant"><option value="msk">Musculoskeletal</option><option value="respiratory">Respiratory</option></select></Field>}
          <Field label="Billing provider">
            <select className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)} data-testid="select-billing-provider">
              <option value="">Practice default</option>
              {(staff.data ?? []).map((s) => <option key={s.id} value={s.title}>{s.title}</option>)}
            </select>
          </Field>
          {policy.query.isError?<ErrorState error={policy.query.error} onRetry={()=>policy.query.refetch()}/>:<EnrollmentPolicySummary selected={policy.selected}/>}
          <label className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="checkbox-consent" />
            <span>Patient gave informed consent, including cost-sharing, and understands they may stop at any time.<span className="mt-1 block text-[11px] text-muted-foreground">Staff attestation recorded under your name with the consent text version and time. Not a verified cryptographic patient e-signature.</span></span>
          </label>
          <Field label="Consent method">
            <select className={inputCls} value={consentMethod} onChange={(e) => setConsentMethod(e.target.value as "verbal" | "written" | "electronic")} data-testid="select-consent-method">
              <option value="verbal">Verbal</option><option value="written">Written</option><option value="electronic">Electronic</option>
            </select>
          </Field>
          {policy.requiresDeviceSharing&&<label className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={deviceSharing} onChange={e=>setDeviceSharing(e.target.checked)} data-testid="checkbox-device-sharing"/><span>Patient explicitly consents to sharing device or app monitoring data with the care team.</span></label>}
        </div>
        <DialogFooter>
          <Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn>
          <Btn variant="primary" disabled={!consent||pending||!policy.selected||policy.query.isError||(policy.requiresDeviceSharing&&!deviceSharing)||(policy.conditionMonths>0&&Number(conditionMonths)<policy.conditionMonths)||(policy.visitMonths>0&&!initiatingVisit)} onClick={() => run({ action: "enroll", patientId: p.id, program, payload: { consent: true,consentMethod,rulepackId:policy.selected?.id,deviceSharing,conditionDurationMonths:conditionMonths?Number(conditionMonths):undefined,initiatingVisitAt:initiatingVisit||undefined, condition: condition || undefined, billingProvider: provider || undefined, ...(program==="RTM"?{variant}:{}) } }, () => { onOpenChange(false); setConsent(false); })} data-testid="button-confirm-enroll">Enroll</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Notes ---------------- */
function NotesTab({ p, notes, drafts }: { p: Patient; notes: CareRecord[]; drafts: CareRecord[] }) {
  const { allow } = usePermission();
  const dlg = useRecordDialog();
  const { run, pending } = useAction();
  const pendingDrafts = drafts.filter((d) => !["accepted", "rejected"].includes(d.status));
  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-3">
        <div className="flex justify-end gap-2">
          {allow("clinical.write") && <AssistChooser p={p} />}
          {allow("clinical.write") && <Btn variant="primary" onClick={dlg.create} data-testid="button-new-note"><Plus className="h-4 w-4" />New note</Btn>}
        </div>
        {!notes.length ? <EmptyState icon={<FileText className="h-4 w-4" />} title="No notes" /> : [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((n) => (
          <Panel key={n.id} title={<span className="flex items-center gap-2">{n.title}<ProgramTag p={n.program} /><StatusPill value={n.status} /></span>} sub={`${n.assignee ?? "Care team"} · ${fmtDateTime(n.date ?? n.createdAt)}`}
            action={<>
              <DraftLifecycle r={n} />
              {allow("clinical.write") && n.status !== "cancelled" && <Btn size="sm" onClick={() => dlg.edit(n)} data-testid={`button-edit-note-${n.id}`}><Pencil className="h-3.5 w-3.5" />{n.status==="signed"?"Addendum":"Edit"}</Btn>}
              {allow("notes.sign") && n.status === "draft" && <ConfirmButton label="Sign" icon={<FileSignature className="h-3.5 w-3.5" />} variant="primary" title="Sign note" desc="Signed notes are locked. Addenda require a new note." confirmLabel="Sign" pending={pending} onConfirm={(_, close) => run({ action: "signNote", id: n.id, payload: { expectedUpdatedAt: n.updatedAt } }, close)} testid={`button-sign-note-${n.id}`} />}
              {n.status !== "draft" && <DocButton r={n} />}
            </>}
          >
            <p className="whitespace-pre-wrap text-sm text-foreground/85">{n.description || <span className="text-muted-foreground">Empty note body.</span>}</p>
          </Panel>
        ))}
      </div>
      <Panel title={<span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" />Drafts for review</span>} sub="Deterministic or live AI drafts. Nothing is filed, sent, signed or committed without a clinician.">
        {pendingDrafts.length ? pendingDrafts.map((d) => (
          <DraftCard key={d.id} d={d} />
        )) : <p className="text-xs text-muted-foreground">No drafts waiting.</p>}
        {drafts.length > pendingDrafts.length && (
          <details className="mt-3 text-xs" data-testid="details-reviewed-drafts">
            <summary className="cursor-pointer text-muted-foreground">Reviewed drafts ({drafts.length - pendingDrafts.length})</summary>
            <div className="mt-2">{drafts.filter((d) => !pendingDrafts.includes(d)).map((d) => <DraftCard key={d.id} d={d} />)}</div>
          </details>
        )}
      </Panel>
      {dlg.open&&<NoteEditor key={dlg.record?.id??"new"} patient={p} record={dlg.record??null} onClose={()=>dlg.onOpenChange(false)}/>}
    </div>
  );
}

/* ---------------- Time ---------------- */
function TimeTab({ p, time }: { p: Patient; time: CareRecord[] }) {
  const { allow, user } = usePermission();
  const canVoid = (t: CareRecord) => !!user && (mStr(t, "userId") === user.id || ["admin", "clinical_admin"].includes(user.role));
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const committed = time.filter((t) => !["voided", "running"].includes(t.status));
  const byProgram = PROGRAMS.map((g) => ({ g, m: committed.filter((t) => t.program === g).reduce((s, t) => s + (t.value ?? 0), 0) })).filter((x) => x.m > 0);
  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <Panel title="Time entries" action={allow("time.write") ? <Btn size="sm" variant="primary" onClick={() => setOpen(true)} data-testid="button-log-time"><Plus className="h-3.5 w-3.5" />Log time</Btn> : undefined} bodyClass="p-0">
        {time.length ? [...time].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((t) => (
          <div key={t.id} className={cn("flex flex-col gap-2 border-b border-border px-4 py-2.5 last:border-b-0 sm:flex-row sm:items-center", t.status === "voided" && "opacity-55")} data-testid={`row-time-${t.id}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm"><span className={cn(t.status === "voided" && "line-through")}>{mStr(t, "activity") ? activityLabel(mStr(t, "activity")) : t.title}</span><ProgramTag p={t.program} />{mBool(t, "isInteractive") && <Pill tone="indigo">interactive</Pill>}<StatusPill value={t.status} /></div>
              <div className="text-xs text-muted-foreground">{fmtDateTime(mStr(t, "startedAt") || t.createdAt)} {mStr(t, "endedAt") && `to ${fmtDate(mStr(t, "endedAt"), "h:mm a")}`} · {t.assignee ?? "Care team"} · {mStr(t, "source") || "manual"}</div>
            </div>
            <span className="tnum font-mono text-sm font-medium">{t.value ?? 0} min</span>
            {allow("time.write") && canVoid(t) && t.status !== "voided" && t.status !== "running" && (
              <ConfirmButton label="Void" variant="ghost" title="Void time entry" desc="Voided time is excluded from billing but kept in the audit trail." reason confirmLabel="Void entry" pending={pending} onConfirm={(reason, close) => run({ action: "voidTime", id: t.id, reason }, close)} testid={`button-void-${t.id}`} />
            )}
          </div>
        )) : <div className="p-4"><EmptyState title="No time recorded" desc="Start a timer from the header or log time after the fact." /></div>}
      </Panel>
      <Panel title="This month by program">
        {byProgram.length ? byProgram.map((x) => (
          <div key={x.g} className="mb-3 last:mb-0">
            <div className="flex justify-between text-xs"><span className="font-medium">{x.g}</span><span className="tnum">{x.m} / 20 min</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (x.m / 20) * 100)}%` }} /></div>
          </div>
        )) : <p className="text-xs text-muted-foreground">No committed minutes.</p>}
      </Panel>
      <LogTimeDialog p={p} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function LogTimeDialog({ p, open, onOpenChange }: { p: Patient; open: boolean; onOpenChange: (o: boolean) => void }) {
  const now = new Date();
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [program, setProgram] = useState(p.programs[0] ?? "CCM");
  const [activity, setActivity] = useState("review_data");
  const [start, setStart] = useState(local(new Date(now.getTime() - 20 * 60000)));
  const [end, setEnd] = useState(local(now));
  const [interactive, setInteractive] = useState(false);
  const [manualReason, setManualReason] = useState("");
  const { run, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Log care time</DialogTitle><DialogDescription>Overlapping or out-of-period time is rejected by the rules engine.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Program"><select className={inputCls} value={program} onChange={(e) => setProgram(e.target.value)} data-testid="select-time-program">{(p.programs.length ? p.programs : PROGRAMS).map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Activity" hint="Only eligible activity codes count toward billing"><select className={inputCls} value={activity} onChange={(e) => setActivity(e.target.value)} data-testid="select-time-activity">{ACTIVITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select></Field>
          <Field label="Started"><input type="datetime-local" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} data-testid="input-time-start" /></Field>
          <Field label="Ended"><input type="datetime-local" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} data-testid="input-time-end" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={interactive} onChange={(e) => setInteractive(e.target.checked)} data-testid="checkbox-interactive" />Activity involved patient communication</label>
        <p className="text-xs text-muted-foreground">A completed phone or video interaction must be logged separately to support live-contact billing evidence.</p>
        <Field label="Manual-entry reason" hint="Required for entries longer than 30 minutes"><input className={inputCls} value={manualReason} onChange={e=>setManualReason(e.target.value)} data-testid="input-manual-time-reason" /></Field>
        <DialogFooter>
          <Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn>
          <Btn variant="primary" disabled={pending || !activity.trim() || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end)<=Date.parse(start) || (Date.parse(end)-Date.parse(start)>30*60000&&!manualReason.trim())} onClick={() => run({ action: "commitTime", patientId: p.id, program, reason:manualReason.trim()||undefined, payload: { startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(), activity, isInteractive: interactive } }, () => {onOpenChange(false);setManualReason("");})} data-testid="button-commit-time">Commit time</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Messages & EHR ---------------- */
function MessagesTab({ p, messages, interactions }: { p: Patient; messages: CareRecord[]; interactions: CareRecord[] }) {
  const { allow } = usePermission();
  const [text, setText] = useState("");
  const { save, pending: saving } = useSaveRecord();
  const { run, pending } = useAction();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const sorted = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const send = () => {
    if (!text.trim()) return;
    save("messages", { title: text.trim().slice(0, 60), description: text.trim(), patientId: p.id, status: "sent", metadata: { direction: "outbound", channel: "secure" } }, undefined, () => setText(""));
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <Panel title="Secure messages" sub="Patient app thread" bodyClass="p-0">
        <div className="max-h-[420px] space-y-2 overflow-y-auto bg-muted/30 p-4">
          {sorted.length ? sorted.map((m) => {
            const out = mStr(m, "direction") !== "inbound";
            return (
              <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")} data-testid={`msg-${m.id}`}>
                <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2 text-sm", out ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm border border-border bg-card")}>
                  <div className="whitespace-pre-wrap">{m.description || m.title}</div>
                  <div className={cn("mt-0.5 text-[10px]", out ? "text-white/70" : "text-muted-foreground")}>{m.assignee ?? (out ? "Care team" : p.firstName)} · {fmtDateTime(m.createdAt)}</div>
                </div>
              </div>
            );
          }) : <p className="py-10 text-center text-xs text-muted-foreground">No messages yet.</p>}
        </div>
        {allow("messages.write") ? <div className="flex gap-2 border-t border-border p-3">
          <input className={inputCls} placeholder={`Message ${p.firstName}`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} data-testid="input-message" />
          <Btn variant="primary" disabled={saving || !text.trim()} onClick={send} data-testid="button-send-message"><Send className="h-3.5 w-3.5" /></Btn>
        </div> : <div className="border-t border-border p-3"><ReadOnlyHint text="Your role can read this thread but not send messages" /></div>}
      </Panel>
      <div className="space-y-5">
        <Panel title="EHR and visits" action={<SimLabel />}>
          <p className="mb-3 text-xs text-muted-foreground">No live EHR or video vendor is connected. These actions exercise the simulated connectors and record what would be exchanged.</p>
          <div className="flex flex-wrap gap-2">
            {allow("clinical.write") && <ConfirmButton label="Sync EHR" icon={<RefreshCw className="h-3.5 w-3.5" />} title="Simulated EHR sync" desc="Writes an interaction entry describing the simulated exchange." confirmLabel="Sync" pending={pending} onConfirm={(_, close) => run({ action: "syncEhr", patientId: p.id }, close)} testid="button-sync-ehr-tab" />}
            {allow("clinical.write") && <ConfirmButton label="Create video visit" icon={<Video className="h-3.5 w-3.5" />} title="Create simulated video visit" desc="Generates a demo visit link. It does not connect to a real video service." confirmLabel="Create" pending={pending} onConfirm={(_, close) => run({ action: "createVideo", patientId: p.id }, (r) => { setVideoUrl(r.url ?? null); close(); })} testid="button-create-video" />}
          </div>
          {videoUrl && <div className="mt-3 rounded-md border border-dashed border-border p-2 text-xs"><span className="text-muted-foreground">Demo link: </span><span className="break-all font-mono" data-testid="text-video-url">{videoUrl}</span></div>}
        </Panel>
        <Panel title="Interactions" sub="Calls, visits, EHR exchanges">
          {interactions.length ? [...interactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((i) => (
            <div key={i.id} className="flex gap-3 border-b border-border py-2 last:border-b-0">
              <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex items-center gap-2">{i.title}{mBool(i, "simulated") && <SimLabel />}</div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(i.date ?? i.createdAt)}{i.description && ` · ${i.description}`}</div>
              </div>
            </div>
          )) : <p className="text-xs text-muted-foreground">No interactions recorded.</p>}
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- Governed assist ---------------- */
const ASSIST: { action: "draftSummary" | "draftNote" | "draftMessage" | "prioritizeQueue" | "suggestTime"; label: string; desc: string; program: boolean }[] = [
  { action: "draftSummary", label: "Summarize recent care", desc: "Draft summary of readings, notes and contact.", program: false },
  { action: "draftNote", label: "Draft a progress note", desc: "Draft note text for the selected program.", program: true },
  { action: "draftMessage", label: "Draft a patient message", desc: "Draft outreach text for review before sending.", program: true },
  { action: "prioritizeQueue", label: "Explain priority", desc: "Rank this patient's open work with stated reasons.", program: true },
  { action: "suggestTime", label: "Suggest time entries", desc: "Propose time from documented activity; nothing is committed.", program: true },
];
function AssistChooser({ p }: { p: Patient }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<(typeof ASSIST)[number]["action"]>("draftSummary");
  const [program, setProgram] = useState(p.programs[0] ?? "");
  const [result, setResult] = useState<string | null>(null);
  const [driver, setDriver] = useState<"deterministic" | "live">("deterministic");
  const [confirmed, setConfirmed] = useState(false);
  const live = driver === "live";
  const { run, pending } = useAction();
  const c = ASSIST.find((a) => a.action === choice)!;
  return (
    <>
      <Btn onClick={() => { setResult(null); setOpen(true); }} data-testid="button-assist"><Sparkles className="h-3.5 w-3.5" />Assist</Btn>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">Governed assist {live ? <Pill tone="indigo">Live AI</Pill> : <SimLabel text="Deterministic test" />}</DialogTitle>
            <DialogDescription>Every result is a pending draft that a clinician must accept or reject. Nothing is signed, sent or committed automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1" role="radiogroup">
            {([["deterministic", "Deterministic test", "Template, no external call"], ["live", "Live AI", "OpenAI via Replit"]] as const).map(([v, l, d]) => (
              <button key={v} type="button" onClick={() => { setDriver(v); setConfirmed(false); }} className={cn("rounded-md px-3 py-1.5 text-left", driver === v ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground")} data-testid={`button-driver-${v}`}>
                <span className="block text-sm font-medium">{l}</span><span className="text-[11px] text-muted-foreground">{d}</span>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            {ASSIST.map((a) => (
              <label key={a.action} className={cn("flex cursor-pointer gap-3 rounded-lg border p-2.5", choice === a.action ? "border-primary bg-accent/50" : "border-border")}>
                <input type="radio" className="mt-1 accent-[hsl(var(--primary))]" checked={choice === a.action} onChange={() => setChoice(a.action)} data-testid={`radio-assist-${a.action}`} />
                <span><span className="block text-sm font-medium">{a.label}</span><span className="text-xs text-muted-foreground">{a.desc}</span></span>
              </label>
            ))}
          </div>
          {c.program && (
            <Field label="Program"><select className={inputCls} value={program} onChange={(e) => setProgram(e.target.value)} data-testid="select-assist-program"><option value="">Any</option>{(p.programs.length ? p.programs : PROGRAMS).map((g) => <option key={g} value={g}>{g}</option>)}</select></Field>
          )}
          {live && (
            <div className="space-y-2 rounded-lg border border-[hsl(38_80%_75%)] bg-[hsl(38_95%_96%)] p-3 text-xs text-[hsl(30_70%_25%)]" data-testid="notice-live-ai">
              <p>Uses Replit AI Integrations for OpenAI. No API key needed; usage is billed to your Replit credits. Never send real patient data.</p>
              <label className="flex items-start gap-2 font-medium"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="checkbox-synthetic-chart" />I confirm this chart is synthetic and contains no real patient information.</label>
            </div>
          )}
          {result && <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs" data-testid="text-assist-result">{result}</div>}
          <DialogFooter>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Close</Btn>
            <Btn variant="primary" disabled={pending || (live && !confirmed)} onClick={() => run({ action: choice, patientId: p.id, ...(c.program && program ? { program } : {}), ...(live ? { payload: { driver: "live", syntheticConfirmed: true } } : {}) }, (r) => setResult(r.message + (r.records?.length ? ` (${r.records.length} item${r.records.length === 1 ? "" : "s"} for review)` : "")))} data-testid="button-run-assist">{pending ? (live ? "Generating…" : "Running…") : live ? "Run live AI" : "Run"}</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

