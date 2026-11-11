import { useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, ClipboardCheck, FileSignature, GitCompare, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import type { CareRecord, Patient } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, ConfirmButton, EmptyState, Field, Panel, Pill, ProgramTag, StatusPill, inputCls } from "@/components/kit";
import { DocButton } from "@/components/doc-viewer";
import { ConflictNotice, DraftLifecycle } from "@/components/draft-lifecycle";
import { isConflict } from "@/lib/record-lifecycle";
import { FormAlert } from "@/components/auth-frame";
import { fmtDate, fmtDateTime, mNum, mStr, useAction, useSaveRecord } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePermission } from "@/components/access";

/* ---------- schema ---------- */
type Program = "RPM" | "RTM" | "CCM" | "PCM" | "BHI";
type FieldDef = { key: string; label: string; type: "list" | "text" | "long" | "date" | "int" | "select"; hint?: string; options?: { v: string; l: string }[]; min?: number; max?: number };
const COMMON: FieldDef[] = [
  { key: "problems", label: "Problems", type: "list", hint: "One per line. Prefilled from the chart's conditions." },
  { key: "goals", label: "Measurable goals", type: "list", hint: "One per line." },
  { key: "interventions", label: "Interventions", type: "list", hint: "One per line." },
  { key: "medications", label: "Medications", type: "list", hint: "One per line. Prefilled from the chart." },
  { key: "reconciledAt", label: "Medications reconciled on", type: "date" },
  { key: "expectedOutcome", label: "Expected outcome", type: "long", hint: "At least 40 characters." },
  { key: "careTeam", label: "Care team", type: "list", hint: "One member per line, with role." },
  { key: "reviewDays", label: "Review interval (days)", type: "int", min: 1, max: 365 },
  { key: "complexity", label: "Complexity", type: "select", options: [{ v: "low", l: "Low" }, { v: "moderate_or_high", l: "Moderate or high" }] },
];
const PROGRAM_FIELDS: Record<string, FieldDef[]> = {
  RPM: [{ key: "monitoredParameters", label: "Monitored parameters", type: "text" }, { key: "readingSchedule", label: "Reading schedule", type: "text" }, { key: "escalationContact", label: "Escalation contact", type: "text" }],
  RTM: [{ key: "diagnosis", label: "Diagnosis", type: "text" }, { key: "therapyReference", label: "Therapy reference", type: "text" }, { key: "exercises", label: "Exercises", type: "long" }],
  PCM: [{ key: "qualifyingCondition", label: "Qualifying condition", type: "text" }, { key: "expectedDurationMonths", label: "Expected duration (months)", type: "int", min: 3, max: 120 }],
  BHI: [{ key: "initialAssessment", label: "Initial assessment", type: "long" }, { key: "scaleKey", label: "Measurement scale", type: "text", hint: "e.g. PHQ-9, GAD-7" }, { key: "referralPath", label: "Referral path", type: "text" }],
  CCM: [],
};
const fieldsFor = (program: string) => [...COMMON, ...(PROGRAM_FIELDS[program] ?? [])];
const LABELS: Record<string, string> = Object.fromEntries([...COMMON, ...Object.values(PROGRAM_FIELDS).flat()].map((f) => [f.key, f.label]));

type Item = { id: string; title: string; kind: string; freq: "DAILY" | "WEEKLY"; interval: number; byday: string[]; hour: number; windowMinutes: number };
const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const ITEM_KINDS = ["checkin", "reading", "exercise", "medication", "education"];

const toArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === "string" && v.trim() ? v.split("\n").map((s) => s.trim()).filter(Boolean) : []);
const meta = (r?: CareRecord) => (r?.metadata ?? {}) as Record<string, unknown>;
function parseItems(v: unknown): Item[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const rr = String(o.rrule ?? "FREQ=DAILY");
    const get = (k: string) => rr.match(new RegExp(`${k}=([^;]+)`))?.[1];
    return {
      id: String(o.id ?? `item-${i}`), title: String(o.title ?? ""), kind: String(o.kind ?? "checkin"),
      freq: get("FREQ") === "WEEKLY" ? "WEEKLY" : "DAILY", interval: Number(get("INTERVAL") ?? 1) || 1,
      byday: (get("BYDAY") ?? "").split(",").filter(Boolean), hour: Number(o.hour ?? 9), windowMinutes: Number(o.windowMinutes ?? 120),
    };
  });
}
const rrule = (it: Item) => `FREQ=${it.freq};INTERVAL=${it.interval}${it.freq === "WEEKLY" && it.byday.length ? `;BYDAY=${it.byday.join(",")}` : ""}`;
const today = () => new Date().toISOString().slice(0, 10);

function missingFields(program: string, m: Record<string, unknown>, description?: string): string[] {
  const miss: string[] = [];
  if (!description?.trim()) miss.push("Assessment summary");
  for (const f of fieldsFor(program)) {
    const v = m[f.key];
    if (f.type === "list") { if (!toArr(v).length) miss.push(f.label); }
    else if (f.type === "int") { const n = Number(v); if (!Number.isInteger(n) || n < (f.min ?? 1) || n > (f.max ?? 365)) miss.push(f.label); }
    else if (f.key === "expectedOutcome") { if (String(v ?? "").trim().length < 40) miss.push(f.label); }
    else if (f.type === "date") { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""))) miss.push(f.label); }
    else if (!String(v ?? "").trim()) miss.push(f.label);
  }
  return miss;
}

/* ---------- tab ---------- */
export function CarePlansSection({ p, plans }: { p: Patient; plans: CareRecord[] }) {
  const [editing, setEditing] = useState<CareRecord | "new" | null>(null);
  const [compare, setCompare] = useState<CareRecord | null>(null);
  const [review, setReview] = useState<CareRecord | null>(null);
  const { run, pending } = useAction();
  const { allow } = usePermission();
  const canWrite = allow("clinical.write");
  const sorted = useMemo(() => [...plans].sort((a, b) => (mNum(b, "version") ?? 0) - (mNum(a, "version") ?? 0) || b.createdAt.localeCompare(a.createdAt)), [plans]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        {canWrite && <ConfirmButton size="md" label="Generate tasks" icon={<ListChecks className="h-4 w-4" />} title="Generate tasks from plans" desc="Creates due tasks from scheduled plan items and missing evidence for this patient." confirmLabel="Generate" pending={pending} onConfirm={(_, c) => run({ action: "generateTasks", patientId: p.id }, c)} testid="button-generate-plan-tasks" />}
        {canWrite && <Btn variant="primary" onClick={() => setEditing("new")} data-testid="button-new-careplan"><Plus className="h-4 w-4" />New care plan</Btn>}
      </div>
      {!sorted.length ? <EmptyState title="No care plan yet" desc="CCM, PCM and BHI require a signed, comprehensive plan before time can bill." action={canWrite ? <Btn variant="primary" onClick={() => setEditing("new")}>Draft a plan</Btn> : undefined} /> : (
        <div className="space-y-4">
          {sorted.map((c) => <PlanCard key={c.id} c={c} hasPrior={sorted.some((o) => o.id !== c.id && o.program === c.program)} onEdit={() => setEditing(c)} onCompare={() => setCompare(c)} onReview={() => setReview(c)} />)}
        </div>
      )}
      {editing && <PlanDialog key={editing === "new" ? "new" : editing.id} p={p} plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {compare && <CompareDialog plan={compare} others={sorted.filter((o) => o.id !== compare.id && o.program === compare.program)} onClose={() => setCompare(null)} />}
      {review && <ReviewDialog plan={review} onClose={() => setReview(null)} />}
    </div>
  );
}

function PlanCard({ c, hasPrior, onEdit, onCompare, onReview }: { c: CareRecord; hasPrior: boolean; onEdit: () => void; onCompare: () => void; onReview: () => void }) {
  const { allow } = usePermission();
  const { run, pending } = useAction();
  const m = meta(c);
  const program = c.program ?? "CCM";
  const signed = c.status === "signed" || c.status === "active";
  const draft = c.status === "draft";
  const miss = missingFields(program, m, c.description);
  const items = parseItems(m.items);
  const done = fieldsFor(program).length + 1 - miss.length;
  const total = fieldsFor(program).length + 1;
  return (
    <Panel title={<span className="flex flex-wrap items-center gap-2">{c.title} <ProgramTag p={c.program} /> <StatusPill value={c.status} /> <span className="text-xs font-normal text-muted-foreground">v{mStr(c, "version") || 1}</span>{Number(m.schemaVersion) !== 2 && <Pill tone="amber">Legacy format</Pill>}</span>}
      sub={signed ? `Signed by ${mStr(c, "signedBy") || "clinician"} on ${fmtDate(mStr(c, "signedAt"))}${mStr(c, "lastReviewedAt") ? ` · reviewed ${fmtDate(mStr(c, "lastReviewedAt"))}` : ""}` : `Review every ${mStr(c, "reviewDays") || "90"} days`}
      action={<div className="flex flex-wrap gap-1.5">
        {(signed || c.status === "cancelled" || c.status === "superseded" || c.status === "closed") && <DocButton r={c} />}
        {hasPrior && <Btn size="sm" variant="ghost" onClick={onCompare} data-testid={`button-compare-plan-${c.id}`}><GitCompare className="h-3.5 w-3.5" />Compare</Btn>}
        {allow("clinical.write") && signed && <Btn size="sm" onClick={onReview} data-testid={`button-review-plan-${c.id}`}><ClipboardCheck className="h-3.5 w-3.5" />Review</Btn>}
        <DraftLifecycle r={c} />
        {allow("clinical.write") && c.status !== "cancelled" && <Btn size="sm" onClick={onEdit} data-testid={`button-edit-plan-${c.id}`}><Pencil className="h-3.5 w-3.5" />{signed ? "Revise as draft" : "Edit"}</Btn>}
        {allow("plans.sign") && draft && <ConfirmButton label="Sign" icon={<FileSignature className="h-3.5 w-3.5" />} variant="primary" title="Sign care plan" desc="Signing attests the plan is comprehensive and was shared with the patient." confirmLabel="Sign plan" pending={pending} disabled={miss.length > 0} onConfirm={(_, close) => run({ action: "signPlan", id: c.id, payload: { expectedUpdatedAt: c.updatedAt } }, close)} testid={`button-sign-plan-${c.id}`} />}
      </div>}>
      <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0 space-y-4">
          {c.description && <p className="text-sm text-foreground/85">{c.description}</p>}
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            {fieldsFor(program).filter((f) => f.key !== "complexity" && f.key !== "reviewDays").map((f) => {
              const v = m[f.key];
              const arr = f.type === "list" ? toArr(v) : [];
              const has = f.type === "list" ? arr.length > 0 : String(v ?? "").trim() !== "";
              return (
                <div key={f.key} className="min-w-0">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{f.label}</div>
                  {!has ? <p className="text-xs text-destructive">Missing</p> : f.type === "list" ? (
                    <ul className="space-y-0.5">{arr.map((g, i) => <li key={i} className="flex gap-2 text-sm"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--brand-orange))]" />{g}</li>)}</ul>
                  ) : <p className="whitespace-pre-line text-sm">{f.type === "date" ? fmtDate(String(v)) : String(v)}</p>}
                </div>
              );
            })}
          </div>
          {items.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Scheduled items</div>
              <div className="flex flex-wrap gap-1.5">{items.map((it) => <span key={it.id} className="rounded-lg border border-border bg-secondary/60 px-2 py-1 text-xs"><span className="font-medium">{it.title}</span> <span className="text-muted-foreground">· {it.freq === "DAILY" ? (it.interval > 1 ? `every ${it.interval} days` : "daily") : `${it.interval > 1 ? `every ${it.interval} wks` : "weekly"} ${it.byday.join(" ")}`} · {String(it.hour).padStart(2, "0")}:00 ±{it.windowMinutes}m</span></span>)}</div>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-secondary/40 p-3" data-testid={`checklist-plan-${c.id}`}>
          <div className="flex items-center justify-between text-xs font-medium"><span>Completeness</span><span className="tnum text-muted-foreground">{done}/{total}</span></div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full brand-rule transition-transform" style={{ width: `${(done / total) * 100}%` }} /></div>
          <ul className="mt-3 space-y-1">
            {["Assessment summary", ...fieldsFor(program).map((f) => f.label)].map((l) => {
              const ok = !miss.includes(l);
              return <li key={l} className={cn("flex items-center gap-1.5 text-[11.5px]", ok ? "text-foreground/75" : "text-destructive")}>{ok ? <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(162_60%_34%)]" strokeWidth={1.6} /> : <CircleDashed className="h-3.5 w-3.5" strokeWidth={1.6} />}{l}</li>;
            })}
          </ul>
          <div className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">Complexity: {String(m.complexity ?? "not set").replace(/_/g, " ")}</div>
        </div>
      </div>
    </Panel>
  );
}

/* ---------- editor ---------- */
function PlanDialog({ p, plan, onClose }: { p: Patient; plan: CareRecord | null; onClose: () => void }) {
  const m0 = meta(plan ?? undefined);
  const { save, pending } = useSaveRecord();
  const [startedAt] = useState(plan?.updatedAt);
  const [conflict, setConflict] = useState(false);
  const [program, setProgram] = useState<string>(plan?.program ?? p.programs[0] ?? "CCM");
  const [title, setTitle] = useState(plan?.title ?? "Comprehensive care plan");
  const [desc, setDesc] = useState(plan?.description ?? "");
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of [...COMMON, ...Object.values(PROGRAM_FIELDS).flat()]) {
      const v = m0[f.key];
      o[f.key] = f.type === "list" ? toArr(v).join("\n") : v == null ? "" : String(v);
    }
    if (!o.problems) o.problems = (p.conditions ?? []).join("\n");
    if (!o.medications) o.medications = (p.medications ?? []).join("\n");
    if (!o.reconciledAt) o.reconciledAt = today();
    if (!o.reviewDays) o.reviewDays = "90";
    if (!o.complexity) o.complexity = "moderate_or_high";
    return o;
  });
  const [items, setItems] = useState<Item[]>(() => parseItems(m0.items));
  const [touched, setTouched] = useState(false);
  const set = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));
  const fields = fieldsFor(program);

  const build = () => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const v = vals[f.key] ?? "";
      out[f.key] = f.type === "list" ? toArr(v) : f.type === "int" ? Number(v) : v.trim();
    }
    return out;
  };
  const itemErr = items.find((it) => !it.title.trim() || it.hour < 0 || it.hour > 23 || it.windowMinutes < 1 || it.windowMinutes > 1440 || it.interval < 1 || (it.freq === "WEEKLY" && !it.byday.length));
  const miss = missingFields(program, build(), desc);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (miss.length || itemErr || !title.trim()) return;
    const metadata = {
      ...m0, ...build(), schemaVersion: 2,
      items: items.map((it) => ({ id: it.id, title: it.title.trim(), kind: it.kind, rrule: rrule(it), hour: it.hour, windowMinutes: it.windowMinutes })),
      version: mNum(plan ?? undefined, "version") ?? 1,
    };
    save("careplans", { title: title.trim(), patientId: p.id, program, status: "draft", description: desc.trim(), metadata }, plan?.id, () => onClose(), { expectedUpdatedAt: startedAt, onError: (e) => setConflict(isConflict(e)) });
  };
  const signed = plan && plan.status !== "draft";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{!plan ? "New care plan" : signed ? "Revise signed plan" : "Edit care plan draft"}</DialogTitle>
          <DialogDescription>{signed ? "Saving creates a new draft version. The signed plan stays unchanged until the new version is signed." : "Structured plan. Every field is required before signing."}</DialogDescription>
        </DialogHeader>
        <form id="plan-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <Field label="Title"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required data-testid="input-plan-title" /></Field>
            <Field label="Program">
              <select className={inputCls} value={program} onChange={(e) => setProgram(e.target.value as Program)} disabled={!!plan} data-testid="select-plan-program">
                {(["CCM", "PCM", "BHI", "RPM", "RTM"] as Program[]).map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Assessment and summary"><textarea className={cn(inputCls, "h-20 py-2")} value={desc} onChange={(e) => setDesc(e.target.value)} data-testid="input-plan-description" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => <PlanField key={f.key} f={f} value={vals[f.key] ?? ""} onChange={(v) => set(f.key, v)} invalid={touched && miss.includes(f.label)} />)}
          </div>
          <fieldset className="rounded-xl border border-border p-3">
            <legend className="px-1 text-xs font-medium">Scheduled items <span className="font-normal text-muted-foreground">(optional)</span></legend>
            {!items.length && <p className="text-xs text-muted-foreground">No recurring items. Add check-ins, readings or exercises the patient should complete on a schedule.</p>}
            <div className="space-y-2">
              {items.map((it, i) => <ItemRow key={it.id} it={it} onChange={(n) => setItems((s) => s.map((x, j) => (j === i ? n : x)))} onRemove={() => setItems((s) => s.filter((_, j) => j !== i))} />)}
            </div>
            <Btn size="sm" className="mt-2" onClick={() => setItems((s) => [...s, { id: `item-${Date.now().toString(36)}`, title: "", kind: "checkin", freq: "DAILY", interval: 1, byday: [], hour: 9, windowMinutes: 120 }])} data-testid="button-add-plan-item"><Plus className="h-3.5 w-3.5" />Add item</Btn>
          </fieldset>
          {touched && (miss.length > 0 || itemErr) && (
            <FormAlert testid="text-plan-validation">
              {miss.length > 0 && <>Complete: {miss.join(", ")}. </>}
              {itemErr && <>Each scheduled item needs a title, hour 0 to 23, window 1 to 1440 minutes, interval of at least 1 and, for weekly items, at least one day.</>}
            </FormAlert>
          )}
        </form>
        <DialogFooter>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" form="plan-form" variant="primary" disabled={pending} data-testid="button-save-plan">{pending ? "Saving…" : signed ? "Save as new draft" : "Save draft"}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanField({ f, value, onChange, invalid }: { f: FieldDef; value: string; onChange: (v: string) => void; invalid: boolean }) {
  const cls = cn(inputCls, invalid && "border-destructive/60");
  const tid = `input-plan-${f.key}`;
  const wide = f.type === "list" || f.type === "long";
  return (
    <Field label={f.label} hint={f.key === "expectedOutcome" ? `${value.trim().length}/40 minimum` : f.hint} className={wide ? "sm:col-span-1" : ""}>
      {f.type === "list" || f.type === "long" ? <textarea className={cn(cls, "h-24 py-2")} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} data-testid={tid} />
        : f.type === "select" ? <select className={cls} value={value} onChange={(e) => onChange(e.target.value)} data-testid={tid}>{f.options!.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
          : <input type={f.type === "date" ? "date" : f.type === "int" ? "number" : "text"} min={f.min} max={f.max} step={f.type === "int" ? 1 : undefined} className={cls} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} data-testid={tid} />}
    </Field>
  );
}

function ItemRow({ it, onChange, onRemove }: { it: Item; onChange: (i: Item) => void; onRemove: () => void }) {
  const up = (p: Partial<Item>) => onChange({ ...it, ...p });
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-2.5" data-testid={`row-plan-item-${it.id}`}>
      <div className="grid gap-2 sm:grid-cols-[1fr_120px_110px_70px_80px_90px_auto] sm:items-end">
        <Field label="Title"><input className={inputCls} value={it.title} onChange={(e) => up({ title: e.target.value })} data-testid={`input-item-title-${it.id}`} /></Field>
        <Field label="Kind"><select className={inputCls} value={it.kind} onChange={(e) => up({ kind: e.target.value })}>{ITEM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
        <Field label="Repeats"><select className={inputCls} value={it.freq} onChange={(e) => up({ freq: e.target.value as Item["freq"] })} data-testid={`select-item-freq-${it.id}`}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option></select></Field>
        <Field label="Every"><input type="number" min={1} max={52} className={inputCls} value={it.interval} onChange={(e) => up({ interval: Number(e.target.value) })} /></Field>
        <Field label="Hour"><input type="number" min={0} max={23} className={inputCls} value={it.hour} onChange={(e) => up({ hour: Number(e.target.value) })} data-testid={`input-item-hour-${it.id}`} /></Field>
        <Field label="Window (min)"><input type="number" min={1} max={1440} className={inputCls} value={it.windowMinutes} onChange={(e) => up({ windowMinutes: Number(e.target.value) })} /></Field>
        <button type="button" onClick={onRemove} className="mb-1 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Remove ${it.title || "item"}`} data-testid={`button-remove-item-${it.id}`}><Trash2 className="h-4 w-4" strokeWidth={1.6} /></button>
      </div>
      {it.freq === "WEEKLY" && (
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Days of week">
          {DAYS.map((d) => <button type="button" key={d} aria-pressed={it.byday.includes(d)} onClick={() => up({ byday: it.byday.includes(d) ? it.byday.filter((x) => x !== d) : [...it.byday, d] })} className={cn("h-7 w-9 rounded-full border text-[11px] font-medium", it.byday.includes(d) ? "border-transparent bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))]" : "border-border bg-card text-muted-foreground")}>{d}</button>)}
        </div>
      )}
      <div className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">{rrule(it)}</div>
    </div>
  );
}

/* ---------- compare ---------- */
const show = (v: unknown) => (v == null || v === "" ? "—" : Array.isArray(v) ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join("\n") : typeof v === "object" ? JSON.stringify(v) : String(v));
function CompareDialog({ plan, others, onClose }: { plan: CareRecord; others: CareRecord[]; onClose: () => void }) {
  const [priorId, setPriorId] = useState(others[0]?.id ?? "");
  const prior = others.find((o) => o.id === priorId);
  const rows = useMemo(() => {
    if (!prior) return [];
    const a = meta(prior), b = meta(plan);
    const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).filter((k) => !["signedBy", "signedAt"].includes(k));
    const r = [{ k: "description", label: "Assessment summary", before: prior.description, after: plan.description }, ...keys.map((k) => ({ k, label: LABELS[k] ?? k, before: a[k], after: b[k] }))];
    return r.filter((x) => JSON.stringify(x.before ?? null) !== JSON.stringify(x.after ?? null));
  }, [prior, plan]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Compare versions</DialogTitle><DialogDescription>v{mStr(plan, "version") || 1} ({plan.status}) against a prior {plan.program} plan.</DialogDescription></DialogHeader>
        <Field label="Compare with">
          <select className={inputCls} value={priorId} onChange={(e) => setPriorId(e.target.value)} data-testid="select-compare-prior">
            {others.map((o) => <option key={o.id} value={o.id}>v{mStr(o, "version") || 1} · {o.status} · {fmtDateTime(o.updatedAt)}</option>)}
          </select>
        </Field>
        {!rows.length ? <EmptyState title="No differences" desc="Description and structured fields are identical." /> : (
          <div className="overflow-hidden rounded-xl border border-border text-sm" data-testid="table-plan-diff">
            <div className="grid grid-cols-[140px_1fr_1fr] border-b border-border bg-secondary/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><span>Field</span><span>Prior</span><span>This version</span></div>
            {rows.map((r) => (
              <div key={r.k} className="grid grid-cols-[140px_1fr_1fr] gap-2 border-b border-border px-3 py-2 last:border-b-0">
                <span className="text-xs font-medium">{r.label}</span>
                <span className="whitespace-pre-wrap break-words rounded bg-[hsl(352_80%_98%)] px-1.5 py-0.5 text-xs text-[hsl(352_60%_32%)] line-through decoration-[hsl(352_60%_32%)]/30">{show(r.before)}</span>
                <span className="whitespace-pre-wrap break-words rounded bg-[hsl(162_45%_96%)] px-1.5 py-0.5 text-xs text-[hsl(162_60%_22%)]">{show(r.after)}</span>
              </div>
            ))}
          </div>
        )}
        <DialogFooter><Btn variant="ghost" onClick={onClose}>Close</Btn></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- review ---------- */
function ReviewDialog({ plan, onClose }: { plan: CareRecord; onClose: () => void }) {
  const { run, pending } = useAction();
  const [summary, setSummary] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!summary.trim()) return setErr("Write a short review summary.");
    if ((start && !end) || (!start && end)) return setErr("Enter both start and end times, or neither.");
    if (start && end && new Date(end) <= new Date(start)) return setErr("End time must be after start time.");
    const payload: Record<string, unknown> = { summary: summary.trim() };
    if (start && end) { payload.startedAt = new Date(start).toISOString(); payload.endedAt = new Date(end).toISOString(); }
    run({ action: "reviewPlan", id: plan.id, patientId: plan.patientId ?? undefined, program: plan.program ?? undefined, payload }, () => onClose());
  };
  const mins = start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) : 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Review {plan.title}</DialogTitle><DialogDescription>Records a plan review. Add actual start and end times only if you want an exact time entry created.</DialogDescription></DialogHeader>
        <form id="review-form" onSubmit={submit} className="space-y-3">
          <Field label="Review summary"><textarea className={cn(inputCls, "h-28 py-2")} value={summary} onChange={(e) => setSummary(e.target.value)} required data-testid="input-review-summary" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Started at (optional)"><input type="datetime-local" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} data-testid="input-review-start" /></Field>
            <Field label="Ended at (optional)"><input type="datetime-local" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} data-testid="input-review-end" /></Field>
          </div>
          {mins > 0 && <p className="text-xs text-muted-foreground">Creates a {mins}-minute time entry from these exact times.</p>}
          {err && <FormAlert testid="text-review-error">{err}</FormAlert>}
        </form>
        <DialogFooter><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" form="review-form" variant="primary" disabled={pending} data-testid="button-submit-review">{pending ? "Saving…" : "Record review"}</Btn></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
