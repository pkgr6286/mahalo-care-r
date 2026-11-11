import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, ClipboardCheck, UserCog, Dumbbell, Home, LogOut, MessageCircle, Pill as PillIcon, Send, Target, Video } from "lucide-react";
import { useGetPatient, useGetSettings, useListPatients, useListRecords, getGetPatientQueryKey, getGetSettingsQueryKey, type CareRecord, type Patient } from "@workspace/api-client-react";
import { Logo, Mark } from "@/components/brand";
import { Btn, ConfirmButton, EmptyState, ErrorState, PageHeader, SimLabel, SkeletonRows, StatusPill, inputCls } from "@/components/kit";
import { fmtDate, fmtDateTime, mArr, mStr, useAction, useSaveRecord } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PatientPreferences } from "@/components/patient-preferences";
import { PatientAttachments } from "@/components/attachments/patient-attachments";
import { EducationCard, isExerciseMaterial } from "@/components/patient/education-card";
import { instrumentGate } from "@/components/admin/instrument-review";
import { readRange } from "@/components/admin/questionnaire-builder";
import { UrgentSupportNotice, isCanonicalPhq9, readAnswerLabels, readInstructions } from "@/components/questionnaire-content";

type Screen = "today" | "checkin" | "exercises" | "meds" | "messages" | "plan";
type Mode = "staff" | "patient";

/** Staff-only preview: patient picker inside the staff shell. */
export default function PatientAppPage() {
  const patients = useListPatients();
  const [pid, setPid] = useState("");
  const id = pid || patients.data?.[0]?.id || "";
  return (
    <div>
      <PageHeader eyebrow="Staff preview" title="Patient experience" desc="Preview the patient app as a selected synthetic patient. Actions are recorded against that patient. Patients use their own sign-in and see only their own record." actions={
        <select className={`${inputCls} w-64`} value={id} onChange={(e) => setPid(e.target.value)} data-testid="select-preview-patient">
          {(patients.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} · {p.programs.join(", ") || "not enrolled"}</option>)}
        </select>
      } />
      {patients.isLoading ? <SkeletonRows rows={4} /> : patients.isError ? <ErrorState error={patients.error} onRetry={() => patients.refetch()} /> : id ? (
        <div className="flex justify-center">
          <div className="w-full max-w-[400px] overflow-hidden rounded-[36px] border-[7px] border-[hsl(var(--brand-charcoal))] bg-background shadow-[0_30px_70px_-30px_hsl(220_5%_12%/.45)]">
            <PatientApp id={id} key={id} mode="staff" />
          </div>
        </div>
      ) : <EmptyState title="No patients to preview" />}
    </div>
  );
}

/** The patient app itself. In "patient" mode it renders full-height for a signed-in patient. */
export function PatientApp({ id, mode, onSignOut, signingOut }: { id: string; mode: Mode; onSignOut?: () => void; signingOut?: boolean }) {
  const q = useGetPatient(id, { query: { enabled: !!id, queryKey: getGetPatientQueryKey(id) } });
  const settings = useGetSettings({ query: { enabled: mode === "staff", queryKey: getGetSettingsQueryKey() } });
  const [screen, setScreen] = useState<Screen>("today");
  const nav: { id: Screen; label: string; icon: typeof Home }[] = [
    { id: "today", label: "Today", icon: Home }, { id: "checkin", label: "Check-in", icon: ClipboardCheck }, { id: "exercises", label: "Exercises", icon: Dumbbell },
    { id: "meds", label: "Meds", icon: PillIcon }, { id: "messages", label: "Messages", icon: MessageCircle }, { id: "plan", label: "Plan", icon: Target },
  ];
  const standalone = mode === "patient";
  return (
    <div className={cn("flex flex-col", standalone ? "min-h-[calc(100dvh-28px)]" : "")}>
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/90 px-5 py-3 backdrop-blur">
        {settings.data?.patientAppName && settings.data.patientAppName !== "Mahalo Care" ? (
          <span className="flex items-center gap-2"><Mark size={24} /><span className="font-serif text-[15px]">{settings.data.patientAppName}</span></span>
        ) : <Logo />}
        {standalone ? (
          <span className="flex items-center gap-1.5">
          <Link href="/account" className="inline-flex items-center gap-1.5 rounded-full border border-input bg-card px-3 py-1 text-xs font-medium transition-colors hover:border-foreground/30" data-testid="link-patient-account"><UserCog className="h-3.5 w-3.5" strokeWidth={1.6} />Account</Link>
          <button onClick={onSignOut} disabled={signingOut} className="inline-flex items-center gap-1.5 rounded-full border border-input bg-card px-3 py-1 text-xs font-medium transition-colors hover:border-foreground/30" data-testid="button-patient-signout">
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.6} />{signingOut ? "Signing out…" : "Sign out"}
          </button>
          </span>
        ) : <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Staff preview</span>}
      </div>
      <div className={cn("overflow-y-auto p-4", standalone ? "mx-auto w-full max-w-md flex-1 pb-20" : "h-[600px]")}>
        {q.isLoading ? <SkeletonRows rows={4} /> : q.isError || !q.data ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <div key={screen} className="rise">
            {screen === "today" && <TodayScreen p={q.data.patient} records={q.data.records} go={setScreen} />}
            {screen === "checkin" && <CheckinScreen p={q.data.patient} />}
            {screen === "exercises" && <ExercisesScreen p={q.data.patient} records={q.data.records} staff={!standalone} />}
            {screen === "meds" && <MedsScreen p={q.data.patient} records={q.data.records} />}
            {screen === "messages" && <MessagesScreen p={q.data.patient} records={q.data.records} />}
            {screen === "plan" && <PlanScreen p={q.data.patient} records={q.data.records} />}
          </div>
        )}
      </div>
      <div className={cn("grid grid-cols-6 border-t border-border bg-card/95 backdrop-blur", standalone && "fixed inset-x-0 bottom-0 z-20 pb-[env(safe-area-inset-bottom)]")}>
        {nav.map((n) => (
          <button key={n.id} onClick={() => setScreen(n.id)} className={cn("relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors", screen === n.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")} data-testid={`pnav-${n.id}`}>
            {screen === n.id && <span className="absolute top-0 h-[2px] w-6 rounded-full bg-[hsl(var(--brand-orange))]" />}<n.icon className={cn("h-[18px] w-[18px]", screen === n.id && "text-primary")} strokeWidth={1.5} />{n.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TodayScreen({ p, records, go }: { p: Patient; records: CareRecord[]; go: (s: Screen) => void }) {
  const { run, pending } = useAction();
  const tasks = records.filter((r) => r.kind === "tasks" && !mStr(r, "adherenceKind") && r.status === "pending" && mStr(r,"audience") !== "staff" && (!mStr(r,"dueAt") || Date.parse(mStr(r,"dueAt")) <= Date.now()));
  const cellular = records
    .filter((r) => r.kind === "observations" && (mStr(r, "source").toLowerCase() === "cellular" || (mStr(r, "source").toLowerCase() === "device" && r.metadata?.deviceCleared === true)))
    .sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt));
  const last = cellular[0];
  return (
    <div className="space-y-4">
      <div><div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Aloha</div><div className="font-serif text-[28px] leading-tight" data-testid="text-patient-greeting">{p.firstName}</div></div>
      <div className="relative overflow-hidden rounded-3xl bg-[hsl(var(--brand-charcoal))] p-5 text-[hsl(var(--background))]">
        <div className="absolute inset-x-0 top-0 h-1 brand-rule" />
        <div className="flex items-center justify-between text-xs text-[hsl(40_12%_76%)]"><span>Last blood pressure</span><span>From your connected cuff</span></div>
        <div className="tnum mt-2 text-[40px] font-medium leading-none tracking-tight" data-testid="text-last-reading">{last ? `${last.value}/${mStr(last, "diastolic")}` : "—"}</div>
        <div className="mt-2 text-xs text-[hsl(40_12%_76%)]">{last ? fmtDateTime(last.date ?? last.createdAt) : "No device readings yet"}</div>
      </div>
      {cellular.length > 1 && (
        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="mb-1 text-xs font-semibold text-muted-foreground">Recent readings</div>
          {cellular.slice(1, 6).map((r) => (
            <div key={r.id} className="flex justify-between py-1 text-sm"><span className="tnum font-mono">{r.value}/{mStr(r, "diastolic")}</span><span className="text-xs text-muted-foreground">{fmtDateTime(r.date ?? r.createdAt)}</span></div>
          ))}
        </div>
      )}
      <div>
        <div className="mb-2 font-serif text-lg">Your to-dos</div>
        {tasks.length ? tasks.map((t) => (
          <div key={t.id} className="mb-2 flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 lift">
            <div className="flex-1 text-sm">{t.title}<div className="text-xs text-muted-foreground">{t.date ? `Due ${fmtDate(t.date, "MMM d")}` : ""}</div></div>
            {windowEnded(t) ? <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground" data-testid={`status-p-task-ended-${t.id}`}>Window ended</span>
              : <Btn size="sm" disabled={pending} onClick={() => run({ action: "completeTask", id: t.id })} data-testid={`button-p-task-${t.id}`}>Done</Btn>}
          </div>
        )) : <p className="rounded-2xl border border-dashed border-border bg-secondary/50 p-5 text-center text-xs text-muted-foreground">You're all caught up.</p>}
      </div>
      <Btn className="w-full" onClick={() => go("checkin")}>Weekly check-in</Btn>
    </div>
  );
}

/* ---------- Check-in instruments (synthetic labels only) ---------- */
const INSTRUMENTS: Record<string, { label: string; count: number; min: number; max: number }> = {
  phq9: { label: "PHQ-9", count: 9, min: 0, max: 3 },
  gad7: { label: "GAD-7", count: 7, min: 0, max: 3 },
  pain_nrs: { label: "Pain NRS", count: 1, min: 0, max: 10 },
  odi: { label: "ODI", count: 10, min: 0, max: 5 },
  pgic: { label: "PGIC", count: 1, min: 1, max: 7 },
};

function CheckinScreen({ p }: { p: Patient }) {
  const inst = useListRecords("instruments");
  const { run, pending } = useAction();
  const available = (inst.data ?? []).filter((i) => i.status !== "retired" && (INSTRUMENTS[mStr(i, "key")] || (readRange(i) && mArr(i, "questions").length > 0)));
  const [iid, setIid] = useState("");
  const instrument = available.find((i) => i.id === iid) ?? available[0];
  const key = mStr(instrument, "key");
  const configured = readRange(instrument);
  const builtIn = INSTRUMENTS[key];
  const configuredCount = mArr(instrument, "questions").length;
  const cfg = configured ? { label: instrument?.title ?? "Check-in", count: configuredCount || builtIn?.count || 0, min: configured.min, max: configured.max } : builtIn;
  const practice = instrument?.metadata?.nonValidatedDemo === true;
  const supplied = mArr(instrument, "questions");
  const gate = instrument ? instrumentGate(instrument) : { custom: false, ok: true, missing: [] as string[] };
  const items = useMemo(() => (cfg ? Array.from({ length: cfg.count }, (_, i) => (supplied.length === cfg.count ? supplied[i] : practice ? `Practice prompt ${i + 1}` : `${cfg.label} item ${i + 1}`)) : []), [cfg, practice, supplied.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [done, setDone] = useState(false);
  const [urgentSeen, setUrgentSeen] = useState(false);
  const canonPhq9 = isCanonicalPhq9(instrument) && !practice;
  const urgentNow = canonPhq9 && (answers[8] ?? 0) > 0;
  const program = instrument?.program && p.programs.includes(instrument.program) ? instrument.program : p.programs[0];
  if (done) return <div className="py-10 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-primary" strokeWidth={1.5} /><div className="mt-2 font-semibold">Submitted</div><p className="text-xs text-muted-foreground">The care team will review the responses.</p>{(urgentSeen || urgentNow) && <UrgentSupportNotice after className="mt-5" />}<Btn className="mt-4" onClick={() => { setDone(false); setAnswers({}); }}>Start another</Btn></div>;
  if (inst.isLoading) return <SkeletonRows rows={3} />;
  if (inst.isError) return <ErrorState error={inst.error} onRetry={() => inst.refetch()} />;
  if (!program) return <EmptyState title="Check-ins are not active" desc="Ask your care team to confirm your enrollment before sharing another check-in." />;
  if (!instrument || !cfg) return <EmptyState title="No check-in available" desc="No supported instrument is configured." />;
  const scale = Array.from({ length: cfg.max - cfg.min + 1 }, (_, i) => cfg.min + i);
  const labels = readAnswerLabels(instrument, scale.length);
  const instructions = readInstructions(instrument);
  return (
    <div className="space-y-4">
      <div className="font-serif text-[22px]">Check-in</div>
      {available.length > 1 && (
        <select className={inputCls} value={instrument.id} onChange={(e) => { setIid(e.target.value); setAnswers({}); }} data-testid="select-instrument">{available.map((i, n) => <option key={i.id} value={i.id}>{i.metadata?.nonValidatedDemo === true ? `Practice check-in ${n + 1}` : i.title}</option>)}</select>
      )}
      {practice && <div className="rounded-lg border border-dashed border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground" data-testid="note-practice-prompts"><span className="font-semibold text-foreground">Synthetic practice prompts.</span> These are demo questions, not a validated questionnaire, and the score is not a clinical result. Answer on a scale of {cfg.min} to {cfg.max}.</div>}
      {!practice && !supplied.length && <p className="rounded-lg border border-dashed border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground" data-testid="note-synthetic-items">Demo item labels are placeholders. Licensed instrument wording is not reproduced. Scale {cfg.min} to {cfg.max}.</p>}
      {gate.custom && !gate.ok && <div role="alert" className="rounded-lg border border-[hsl(38_80%_82%)] bg-[hsl(38_95%_95%)] p-2.5 text-xs text-[hsl(30_80%_30%)]" data-testid="gate-instrument-content"><div className="font-semibold">This check-in is not ready yet</div>Its question wording is waiting for review by your care team ({gate.missing.join("; ")}). Please check back later.</div>}
      {urgentSeen && !urgentNow && <UrgentSupportNotice after />}
      {instructions && !(gate.custom && !gate.ok) && <p className="rounded-xl bg-muted/50 p-3 text-sm leading-snug" data-testid="text-checkin-instructions">{instructions}</p>}
      {gate.custom && !gate.ok ? null : items.map((q, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-3.5">
          <div className="text-sm">{q}</div>
          {labels.length ? (
            <div className="mt-2 grid gap-1" role="radiogroup" aria-label={`Answer for question ${i + 1}`}>
              {scale.map((v, n) => (
                <button key={v} role="radio" aria-checked={answers[i] === v} onClick={() => setAnswers((a) => ({ ...a, [i]: v }))} className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors", answers[i] === v ? "border-[hsl(var(--brand-charcoal))] bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))]" : "border-border bg-card hover:border-foreground/30")} data-testid={`answer-${i}-${v}`}>
                  <span className="tnum w-4 shrink-0 text-xs opacity-70">{v}</span><span>{labels[n]}</span>
                </button>
              ))}
            </div>
          ) : <div className={cn("mt-2 grid gap-1", scale.length > 7 ? "grid-cols-6" : `grid-cols-${scale.length}`)} style={{ gridTemplateColumns: `repeat(${Math.min(scale.length, 6)}, minmax(0,1fr))` }}>
            {scale.map((v) => (
              <button key={v} onClick={() => setAnswers((a) => ({ ...a, [i]: v }))} className={cn("tnum rounded-lg border py-2 text-xs font-medium transition-colors", answers[i] === v ? "border-[hsl(var(--brand-charcoal))] bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))]" : "border-border bg-card hover:border-foreground/30")} data-testid={`answer-${i}-${v}`}>{v}</button>
            ))}
          </div>}
        </div>
      ))}
      {urgentNow && <UrgentSupportNotice />}
      <Btn variant="primary" className="w-full" disabled={pending || !gate.ok || Object.keys(answers).length < items.length} onClick={() => run({ action: "submitCheckin", patientId: p.id, program, payload: { instrument: key, instrumentId: instrument.id, answers: items.map((_, i) => answers[i]) } }, () => { if (urgentNow) setUrgentSeen(true); setDone(true); })} data-testid="button-submit-checkin">Submit</Btn>
    </div>
  );
}

/* ---------- Adherence ---------- */
type AdhKind = "medication" | "exercise" | "education";
/** Today's date (YYYY-MM-DD) in the patient's own timezone, matching backend metadata.day */
function todayIn(tz?: string) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  catch { return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
}
function adherenceToday(records: CareRecord[], kind: AdhKind, title: string, tz?: string) {
  const today = todayIn(tz);
  return records.find((r) => r.kind === "tasks" && mStr(r, "adherenceKind") === kind && mStr(r, "activityTitle") === title && mStr(r, "day") === today);
}

const BARRIERS = [
  { code: "too_painful", label: "Too painful" },
  { code: "side_effects", label: "Side effects" },
  { code: "forgot", label: "Forgot" },
  { code: "unavailable", label: "Not available" },
  { code: "other", label: "Other" },
] as const;
function windowEnded(t: CareRecord) {
  const due = Date.parse(mStr(t, "dueAt"));
  const w = Number(t.metadata?.windowMinutes);
  return Number.isFinite(due) && Number.isFinite(w) && Date.now() > due + w * 60000;
}

function AdherenceItem({ p, kind, title, program, sub, records }: { p: Patient; kind: AdhKind; title: string; program: string; sub?: string; records: CareRecord[] }) {
  const { run, pending } = useAction();
  const [skipping, setSkipping] = useState(false);
  const [barrier, setBarrier] = useState("");
  const [barrierCode, setBarrierCode] = useState("");
  const barrierLabel = BARRIERS.find((b) => b.code === barrierCode)?.label ?? "";
  const barrierText = barrier.trim() ? (barrierCode && barrierCode !== "other" ? `${barrierLabel}: ${barrier.trim()}` : barrier.trim()) : barrierLabel;
  const canSkip = !!barrierCode && (barrierCode !== "other" || barrier.trim().length >= 3) && barrierText.length >= 3;
  const existing = adherenceToday(records, kind, title, p.timezone);
  const send = (status: "done" | "skipped") =>
    run({ action: "recordAdherence", patientId: p.id, program, payload: { kind, title, status, ...(status === "skipped" ? { barrierCode, barrier: barrierText } : {}) } }, () => { setSkipping(false); setBarrier(""); setBarrierCode(""); });
  const st = existing ? (existing.status === "skipped" || mStr(existing, "status") === "skipped" ? "skipped" : "done") : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5" data-testid={`adherence-${kind}-${title}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><div className="text-sm">{title}</div>{sub && <div className="text-xs text-muted-foreground line-clamp-2">{sub}</div>}</div>
        {st ? (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", st === "done" ? "bg-[hsl(150_40%_93%)] text-[hsl(152_60%_24%)]" : "bg-[hsl(38_95%_93%)] text-[hsl(30_80%_32%)]")} data-testid="status-adherence">{st === "done" ? "Done today" : "Skipped today"}</span>
        ) : (
          <div className="flex gap-1">
            <Btn size="sm" variant="primary" disabled={pending} onClick={() => send("done")} data-testid="button-adherence-done">Done</Btn>
            <Btn size="sm" variant="ghost" disabled={pending} onClick={() => setSkipping((s) => !s)} data-testid="button-adherence-skip">Skip</Btn>
          </div>
        )}
      </div>
      {skipping && !st && (
        <fieldset className="mt-2 space-y-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">What got in the way?</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup">
            {BARRIERS.map((b) => (
              <button key={b.code} type="button" role="radio" aria-checked={barrierCode === b.code} onClick={() => setBarrierCode(b.code)} className={cn("rounded-full border px-3 py-1 text-xs", barrierCode === b.code ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground")} data-testid={`button-barrier-${b.code}`}>{b.label}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input aria-label="Details" className={inputCls} placeholder={barrierCode === "other" ? "Tell us a little more (required)" : "Details (optional)"} value={barrier} onChange={(e) => setBarrier(e.target.value)} data-testid="input-barrier" />
            <Btn size="sm" disabled={pending || !canSkip} onClick={() => send("skipped")} data-testid="button-confirm-skip">Save</Btn>
          </div>
        </fieldset>
      )}
    </div>
  );
}

function ExercisesScreen({ p, records, staff }: { p: Patient; records: CareRecord[]; staff: boolean }) {
  const ed = useListRecords("education");
  const items = (ed.data ?? []).filter((e) => (!e.patientId || e.patientId === p.id) && (!e.program || p.programs.includes(e.program)));
  const exercises = items.filter(isExerciseMaterial);
  const reading = items.filter((e) => !isExerciseMaterial(e));
  return (
    <div className="space-y-3">
      <div className="font-serif text-[22px]">Exercises and learning</div>
      {ed.isLoading ? <SkeletonRows rows={3} /> : ed.isError ? <ErrorState error={ed.error} onRetry={() => ed.refetch()} /> : !items.length ? <p className="text-xs text-muted-foreground">Nothing assigned yet.</p> : (
        <>
          {exercises.map((e) => <AdherenceItem key={e.id} p={p} records={records} kind="exercise" title={e.title} sub={e.description} program={e.program ?? p.programs[0] ?? "RTM"} />)}
          {reading.length > 0 && <div className="pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">To read</div>}
          {reading.map((e) => <EducationCard key={e.id} p={p} m={e} records={records} staff={staff} />)}
        </>
      )}
    </div>
  );
}

function MedsScreen({ p, records }: { p: Patient; records: CareRecord[] }) {
  const meds = p.medications ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 font-serif text-[22px]"><PillIcon className="h-4 w-4 text-primary" strokeWidth={1.7} />Medications</div>
      {meds.length ? meds.map((m) => <AdherenceItem key={m} p={p} records={records} kind="medication" title={m} program={p.programs.includes("CCM") ? "CCM" : p.programs[0] ?? "CCM"} />) : <p className="text-xs text-muted-foreground">No medications on file.</p>}
      <p className="text-[11px] text-muted-foreground">One confirmation per item per day, based on your local date. Responses are recorded for the care team.</p>
    </div>
  );
}

function MessagesScreen({ p, records }: { p: Patient; records: CareRecord[] }) {
  const [text, setText] = useState("");
  const { save, pending } = useSaveRecord();
  const msgs = records.filter((r) => r.kind === "messages").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const send = () => text.trim() && save("messages", { title: text.trim().slice(0, 60), description: text.trim(), patientId: p.id, status: "unread", metadata: { direction: "inbound", channel: "app" } }, undefined, () => setText(""));
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between"><span className="font-serif text-[22px]">Care team</span><VideoRequest p={p} /></div>
      <div className="flex-1 space-y-2">
        {msgs.map((m) => {
          const mine = mStr(m, "direction") === "inbound";
          return <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}><div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "rounded-br-md bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))]" : "rounded-bl-md border border-border bg-card")}>{m.description || m.title}</div></div>;
        })}
        {!msgs.length && <p className="text-xs text-muted-foreground">Say hello to your care team.</p>}
      </div>
      <div className="mt-3 flex gap-2"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message" data-testid="input-p-message" /><Btn variant="primary" disabled={pending || !text.trim()} onClick={send} data-testid="button-p-send"><Send className="h-3.5 w-3.5" /></Btn></div>
    </div>
  );
}

function VideoRequest({ p }: { p: Patient }) {
  const { run, pending } = useAction();
  const [url, setUrl] = useState<string | null>(null);
  return (
    <div className="text-right">
      <ConfirmButton label="Video visit" icon={<Video className="h-3.5 w-3.5" />} title="Start a video visit link" desc="Creates a demo visit link. Video is simulated in this demo and does not connect to a real service." confirmLabel="Create link" pending={pending} onConfirm={(_, close) => run({ action: "createVideo", patientId: p.id }, (r) => { setUrl(r.url ?? null); close(); })} testid="button-p-video" />
      {url && <div className="mt-1 flex items-center justify-end gap-1 text-[10px]"><SimLabel /><span className="max-w-[180px] truncate font-mono" data-testid="text-p-video-url">{url}</span></div>}
    </div>
  );
}

function PlanScreen({ p, records }: { p:Patient; records: CareRecord[] }) {
  const plan = records.filter((r) => r.kind === "careplans" && (r.status === "signed" || r.status === "active")).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const consents = records.filter((r) => r.kind === "consents");
  return (
    <div className="space-y-4">
      {!plan && <EmptyState title="Your plan is being prepared" desc="Your care team will share it once it is signed." />}
      {plan && <>
      <div className="font-serif text-[22px]">My care plan</div>
      {plan.description && <p className="text-sm text-foreground/85">{plan.description}</p>}
      {(["goals", "interventions"] as const).map((k) => (
        <div key={k}><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{k === "goals" ? "My goals" : "What we'll do"}</div>
          {mArr(plan, k).map((g, i) => <div key={i} className="mb-1.5 rounded-lg border border-border bg-card p-2.5 text-sm">{g}</div>)}</div>
      ))}
      <p className="text-[11px] text-muted-foreground">Signed {fmtDate(mStr(plan, "signedAt"))} by {mStr(plan, "signedBy")}</p>
      </>}
      {consents.length > 0 && <Consents consents={consents} />}
      <PatientAttachments patientId={p.id} audience="patient" />
      <PatientPreferences patient={p} records={records}/>
    </div>
  );
}

function Consents({ consents }: { consents: CareRecord[] }) {
  const { run, pending } = useAction();
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">My consents</div>
      {consents.map((c) => (
        <div key={c.id} className="mb-1.5 flex items-center gap-2 rounded-lg border border-border bg-card p-2.5 text-sm" data-testid={`p-consent-${c.id}`}>
          <span className="flex-1">{c.title}{c.program ? <span className="ml-1 text-xs text-muted-foreground">{c.program}</span> : null}</span>
          <StatusPill value={c.status} />
          {!["revoked", "withdrawn"].includes(c.status) && (
            <ConfirmButton label="Withdraw" variant="ghost" title="Withdraw consent" desc="Your care team will be notified and this program's monitoring will stop. You can re-consent with your care team later." reason reasonLabel="Tell us why (required)" confirmLabel="Withdraw consent" pending={pending} onConfirm={(reason, close) => run({ action: "revokeConsent", id: c.id, reason }, close)} testid={`button-p-revoke-${c.id}`} />
          )}
        </div>
      ))}
    </div>
  );
}
