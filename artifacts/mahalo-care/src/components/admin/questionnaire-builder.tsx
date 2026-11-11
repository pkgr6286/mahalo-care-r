import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { CareRecord } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Field, inputCls } from "@/components/kit";
import { PROGRAMS, mStr, useSaveRecord } from "@/lib/api";
import { cn } from "@/lib/utils";
import { INSTRUMENT_COUNTS } from "@/components/admin/instrument-review";
import { QuestionnairePreview } from "@/components/questionnaire-content";

export type ScoringMethod = "sum" | "mean" | "percentage" | "lookup";
type Row = { raw: string; score: string };
type Band = { min: string; max: string; label: string };
const METHODS: { id: ScoringMethod; label: string; desc: string }[] = [
  { id: "sum", label: "Sum", desc: "Total of all answers." },
  { id: "mean", label: "Average", desc: "Sum divided by the number of answered items." },
  { id: "percentage", label: "Percentage", desc: "Sum as a percent of the maximum possible." },
  { id: "lookup", label: "Conversion table", desc: "Raw sum converted with a table from your approved source." },
];
const isInt = (s: string) => /^-?\d+$/.test(s.trim());
const isNum = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));

export function QuestionnaireBuilder({ existing, onClose }: { existing: CareRecord[]; onClose: () => void }) {
  const { save, pending } = useSaveRecord();
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [program, setProgram] = useState<string>("");
  const [questions, setQuestions] = useState<string[]>([""]);
  const [min, setMin] = useState("0");
  const [max, setMax] = useState("4");
  const [method, setMethod] = useState<ScoringMethod>("sum");
  const [factor, setFactor] = useState("");
  const [lookup, setLookup] = useState<Row[]>([]);
  const [importText, setImportText] = useState("");
  const [lookupApproved, setLookupApproved] = useState(false);
  const [bands, setBands] = useState<Band[]>([]);
  const [sourceRef, setSourceRef] = useState("");
  const [licenseNote, setLicenseNote] = useState("");
  const [version, setVersion] = useState("1.0");
  const [tried, setTried] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [labels, setLabels] = useState<string[]>([]);

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  const effKey = keyTouched ? key : slug(title);
  const qs = questions.map((q) => q.trim()).filter(Boolean);
  const lo = Number(min), hi = Number(max);
  const rawMin = qs.length * lo, rawMax = qs.length * hi;
  const optCount = isInt(min) && isInt(max) && hi > lo && hi - lo <= 20 ? hi - lo + 1 : 0;
  const labelsUsed = labels.slice(0, optCount).map((x) => x.trim());
  const anyLabel = labelsUsed.some(Boolean);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Required";
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(effKey)) e.key = "Lowercase letters, digits and underscores; start with a letter";
    else if (INSTRUMENT_COUNTS[effKey] !== undefined) e.key = "Reserved for a built-in instrument";
    else if (existing.some((r) => mStr(r, "key") === effKey)) e.key = "Another instrument already uses this key";
    if (!qs.length) e.questions = "Add at least one question";
    if (!isInt(min) || !isInt(max)) e.range = "Whole numbers only";
    else if (lo >= hi) e.range = "Maximum must be above minimum";
    else if (hi - lo > 20) e.range = "At most 21 answer options";
    if (factor.trim() && !isNum(factor)) e.factor = "Must be a number";
    if (method === "lookup") {
      if (!lookup.length) e.lookup = "Add the conversion rows from your source";
      else if (lookup.some((r) => !isInt(r.raw) || !isNum(r.score))) e.lookup = "Raw values must be whole numbers; scores must be numbers";
      else if (new Set(lookup.map((r) => Number(r.raw))).size !== lookup.length) e.lookup = "Each raw value may appear once";
      else if (!e.range && lookup.some((r) => Number(r.raw) < rawMin || Number(r.raw) > rawMax)) e.lookup = `Raw values must fall between ${rawMin} and ${rawMax}`;
      if (!lookupApproved) e.lookupApproved = "Confirm the table comes from an approved source";
    }
    if (bands.some((b) => !isNum(b.min) || !isNum(b.max) || !b.label.trim() || Number(b.min) > Number(b.max))) e.bands = "Each band needs a label and a valid from/to";
    if (anyLabel && (labelsUsed.length < optCount || labelsUsed.some((x) => !x))) e.labels = "Label every answer option, or leave all blank";
    if (instructions.length > 1000) e.instructions = "At most 1000 characters";
    if (!sourceRef.trim()) e.sourceRef = "Required";
    if (licenseNote.trim().length < 20) e.licenseNote = "At least 20 characters";
    if (!version.trim()) e.version = "Required";
    return e;
  }, [title, effKey, existing, qs.length, min, max, lo, hi, factor, method, lookup, lookupApproved, rawMin, rawMax, bands, sourceRef, licenseNote, version, anyLabel, labelsUsed.join("|"), optCount, instructions.length]);

  const missingRaws = method === "lookup" && !errors.range && !errors.lookup ? (() => { const have = new Set(lookup.map((r) => Number(r.raw))); const out: number[] = []; for (let i = rawMin; i <= rawMax; i++) if (!have.has(i)) out.push(i); return out; })() : [];

  const doImport = () => {
    const rows = importText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[,\t;]+|\s+/)).filter((p) => p.length >= 2).map(([raw, score]) => ({ raw: raw.trim(), score: score.trim() }));
    if (rows.length) { setLookup(rows); setImportText(""); setLookupApproved(false); }
  };

  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    const scoring: Record<string, unknown> = { method };
    if (factor.trim()) scoring.factor = Number(factor);
    if (method === "lookup") scoring.lookup = lookup.map((r) => ({ raw: Number(r.raw), score: Number(r.score) })).sort((a, b) => a.raw - b.raw);
    if (bands.length) scoring.bands = bands.map((b) => ({ min: Number(b.min), max: Number(b.max), label: b.label.trim() }));
    save("instruments", {
      title: title.trim(), program: program || null, status: "draft",
      description: `${qs.length}-item questionnaire, answers ${lo} to ${hi}. Awaiting content review.`,
      metadata: {
        key: effKey, questions: qs, range: { min: lo, max: hi }, scoring,
        sourceRef: sourceRef.trim(), licenseNote: licenseNote.trim(), contentVersion: version.trim(),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}), ...(anyLabel ? { answerLabels: labelsUsed } : {}), language: "en",
        contentApprovedForUse: false, ...(method === "lookup" ? { lookupSourceConfirmed: true } : {}),
      },
    }, undefined, onClose);
  };

  const err = (k: string) => (tried ? errors[k] : undefined);
  const Err = ({ k }: { k: string }) => err(k) ? <p className="mt-1 text-[11px] text-destructive">{err(k)}</p> : null;
  const move = (i: number, d: -1 | 1) => setQuestions((q) => { const n = [...q]; const j = i + d; if (j < 0 || j >= n.length) return q; [n[i], n[j]] = [n[j], n[i]]; return n; });

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New questionnaire</DialogTitle>
          <DialogDescription>Saved as a draft that patients cannot see. It becomes available after someone completes the content review and attests permission.</DialogDescription>
        </DialogHeader>

        <Section n={1} title="Basics">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2"><input className={cn(inputCls, err("title") && "border-destructive")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name your own questionnaire" data-testid="input-q-title" /><Err k="title" /></Field>
            <Field label="Key" hint="Stored with each response"><input className={cn(inputCls, "font-mono text-xs", err("key") && "border-destructive")} value={effKey} onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toLowerCase()); }} data-testid="input-q-key" /><Err k="key" /></Field>
            <Field label="Program"><select className={inputCls} value={program} onChange={(e) => setProgram(e.target.value)} data-testid="select-q-program"><option value="">Any enrolled program</option>{PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Use your own name. Do not label it as a published validated questionnaire unless your practice holds rights to that content.</p>
        </Section>

        <Section n={2} title={`Questions (${qs.length})`}>
          <Field label="Instructions" hint="Optional · shown above the questions, e.g. the recall period" className="mb-3"><textarea className={cn(inputCls, "h-16 resize-y py-2 text-sm", err("instructions") && "border-destructive")} value={instructions} maxLength={1000} onChange={(e) => setInstructions(e.target.value)} placeholder="Over the last 2 weeks, how often have you been bothered by the following?" data-testid="input-q-instructions" /><Err k="instructions" /></Field>
          <ol className="space-y-2">
            {questions.map((q, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="tnum mt-2 w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}.</span>
                <textarea rows={1} className={cn(inputCls, "min-h-9 flex-1 resize-y py-2 text-sm")} value={q} onChange={(e) => setQuestions((s) => s.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Question wording from your approved source" data-testid={`input-q-question-${i}`} />
                <div className="flex shrink-0 gap-0.5">
                  <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === questions.length - 1}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label="Remove question" onClick={() => setQuestions((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : [""]))} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                </div>
              </li>
            ))}
          </ol>
          <Btn size="sm" className="mt-2" onClick={() => setQuestions((s) => [...s, ""])} data-testid="button-q-add-question"><Plus className="h-3.5 w-3.5" />Add question</Btn>
          <Err k="questions" />
        </Section>

        <Section n={3} title="Answers and scoring">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Lowest answer"><input type="number" step={1} className={cn(inputCls, err("range") && "border-destructive")} value={min} onChange={(e) => setMin(e.target.value)} data-testid="input-q-min" /></Field>
            <Field label="Highest answer"><input type="number" step={1} className={cn(inputCls, err("range") && "border-destructive")} value={max} onChange={(e) => setMax(e.target.value)} data-testid="input-q-max" /></Field>
            <Field label="Multiply result by" hint="Optional"><input className={cn(inputCls, err("factor") && "border-destructive")} value={factor} onChange={(e) => setFactor(e.target.value)} placeholder="none" data-testid="input-q-factor" /></Field>
          </div>
          <Err k="range" /><Err k="factor" />
          {optCount > 0 && <div className="mt-3">
            <div className="mb-1 text-xs font-medium">Answer labels <span className="font-normal text-muted-foreground">Optional · all or none</span></div>
            <div className="grid gap-1.5 sm:grid-cols-2">{Array.from({ length: optCount }, (_, n) => (
              <label key={n} className="flex items-center gap-2"><span className="tnum w-6 shrink-0 text-right text-xs text-muted-foreground">{lo + n}</span><input className={cn(inputCls, "h-8 text-sm", err("labels") && !labelsUsed[n] && "border-destructive")} value={labels[n] ?? ""} maxLength={120} onChange={(e) => setLabels((cur) => { const nx = [...cur]; while (nx.length < optCount) nx.push(""); nx[n] = e.target.value; return nx; })} placeholder={n === 0 ? "e.g. Not at all" : ""} data-testid={`input-q-label-${n}`} /></label>
            ))}</div>
            <Err k="labels" />
          </div>}
          <div className="mt-3"><QuestionnairePreview title={title} instructions={instructions.trim()} questions={qs} min={lo} max={hi} labels={anyLabel && !errors.labels ? labelsUsed : []} /></div>
          {!errors.range && qs.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Raw total ranges from {rawMin} to {rawMax}.</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Scoring method">
            {METHODS.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={method === m.id} onClick={() => setMethod(m.id)} className={cn("rounded-lg border px-3 py-2 text-left transition-colors", method === m.id ? "border-[hsl(var(--brand-orange))] bg-[hsl(var(--brand-orange)/0.06)]" : "border-border hover:bg-secondary/60")} data-testid={`radio-q-method-${m.id}`}>
                <div className="text-sm font-medium">{m.label}</div><div className="text-[11px] text-muted-foreground">{m.desc}</div>
              </button>
            ))}
          </div>
          {method === "lookup" && (
            <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs font-medium">Conversion table</div>
              <p className="text-[11px] text-muted-foreground">Enter the exact raw-to-score table from your licensed or owner-approved source. Nothing is filled in for you.</p>
              {lookup.length > 0 && (
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground"><span>Raw total</span><span>Score</span><span /></div>
                  {lookup.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_2rem] gap-2">
                      <input className={cn(inputCls, "h-8 text-xs")} value={r.raw} onChange={(e) => { setLookupApproved(false); setLookup((s) => s.map((x, j) => (j === i ? { ...x, raw: e.target.value } : x))); }} aria-label={`Raw total row ${i + 1}`} />
                      <input className={cn(inputCls, "h-8 text-xs")} value={r.score} onChange={(e) => { setLookupApproved(false); setLookup((s) => s.map((x, j) => (j === i ? { ...x, score: e.target.value } : x))); }} aria-label={`Score row ${i + 1}`} />
                      <IconBtn label="Remove row" onClick={() => { setLookupApproved(false); setLookup((s) => s.filter((_, j) => j !== i)); }} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Btn size="sm" onClick={() => { setLookupApproved(false); setLookup((s) => [...s, { raw: "", score: "" }]); }} data-testid="button-q-add-lookup"><Plus className="h-3.5 w-3.5" />Add row</Btn>
                {lookup.length > 0 && <Btn size="sm" variant="ghost" onClick={() => { setLookup([]); setLookupApproved(false); }}>Clear table</Btn>}
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Paste a table</summary>
                <textarea className={cn(inputCls, "mt-2 h-24 py-2 font-mono text-xs")} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"One row per line: raw total, score"} data-testid="input-q-lookup-import" />
                <Btn size="sm" className="mt-2" disabled={!importText.trim()} onClick={doImport} data-testid="button-q-lookup-import">Replace table with pasted rows</Btn>
              </details>
              <Err k="lookup" />
              {missingRaws.length > 0 && <p className="text-[11px] text-[hsl(30_70%_32%)]">No score for raw total{missingRaws.length > 1 ? "s" : ""} {missingRaws.slice(0, 12).join(", ")}{missingRaws.length > 12 ? "…" : ""}. Those responses will have no converted score.</p>}
              <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={lookupApproved} onChange={(e) => setLookupApproved(e.target.checked)} data-testid="check-q-lookup-approved" /><span>This table is copied from the approved source named below. It was not estimated or derived here.</span></label>
              <Err k="lookupApproved" />
            </div>
          )}
        </Section>

        <Section n={4} title="Interpretation bands" optional>
          {bands.map((b, i) => (
            <div key={i} className="mb-2 grid grid-cols-[5rem_5rem_1fr_2rem] gap-2">
              <input className={cn(inputCls, "h-8 text-xs")} placeholder="From" value={b.min} onChange={(e) => setBands((s) => s.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} aria-label={`Band ${i + 1} from`} />
              <input className={cn(inputCls, "h-8 text-xs")} placeholder="To" value={b.max} onChange={(e) => setBands((s) => s.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))} aria-label={`Band ${i + 1} to`} />
              <input className={cn(inputCls, "h-8 text-xs")} placeholder="Label from your source" value={b.label} onChange={(e) => setBands((s) => s.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={`Band ${i + 1} label`} />
              <IconBtn label="Remove band" onClick={() => setBands((s) => s.filter((_, j) => j !== i))} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
            </div>
          ))}
          <Btn size="sm" onClick={() => setBands((s) => [...s, { min: "", max: "", label: "" }])} data-testid="button-q-add-band"><Plus className="h-3.5 w-3.5" />Add band</Btn>
          <Err k="bands" />
          <p className="mt-1 text-[11px] text-muted-foreground">Bands apply to the final score{method === "lookup" ? " after conversion" : ""}. Leave empty if your source defines none.</p>
        </Section>

        <Section n={5} title="Source and permission">
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field label="Source reference"><input className={cn(inputCls, err("sourceRef") && "border-destructive")} value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="Author, publication or internal document" data-testid="input-q-source" /><Err k="sourceRef" /></Field>
            <Field label="Content version"><input className={cn(inputCls, err("version") && "border-destructive")} value={version} onChange={(e) => setVersion(e.target.value)} data-testid="input-q-version" /><Err k="version" /></Field>
          </div>
          <Field label="License / permission note" hint={`${licenseNote.trim().length} / 20 characters minimum`} className="mt-3"><textarea className={cn(inputCls, "h-20 resize-y py-2", err("licenseNote") && "border-destructive")} value={licenseNote} onChange={(e) => setLicenseNote(e.target.value)} placeholder="Who granted permission, for what use, and where it is documented" data-testid="input-q-license" /><Err k="licenseNote" /></Field>
        </Section>

        <DialogFooter className="items-center">
          <span className="mr-auto text-[11px] text-muted-foreground">{tried && Object.keys(errors).length ? <span className="text-destructive">Fix {Object.keys(errors).length} item{Object.keys(errors).length === 1 ? "" : "s"} above</span> : "Saves as draft, not approved for use"}</span>
          <Btn variant="ghost" onClick={onClose} disabled={pending}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} disabled={pending} data-testid="button-q-save">{pending ? "Saving…" : "Save draft"}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ n, title, optional, children }: { n: number; title: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="tnum flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[11px]">{n}</span>{title}{optional && <span className="text-[11px] font-normal text-muted-foreground">Optional</span>}</h3>
      {children}
    </section>
  );
}
function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground disabled:opacity-30", danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-secondary hover:text-foreground")}>{children}</button>;
}

/* Shared helpers for reading a configured instrument */
export type InstrumentConfig = { label: string; count: number; min: number; max: number; custom: boolean };
export function readRange(r?: CareRecord): { min: number; max: number } | null {
  const v = r?.metadata?.range as { min?: unknown; max?: unknown } | undefined;
  if (v && Number.isInteger(v.min) && Number.isInteger(v.max) && (v.max as number) > (v.min as number)) return { min: v.min as number, max: v.max as number };
  return null;
}
export function scoringSummary(r: CareRecord): string {
  const s = r.metadata?.scoring as { method?: string; lookup?: unknown[]; bands?: unknown[]; factor?: number } | undefined;
  if (!s?.method) return "";
  const m = METHODS.find((x) => x.id === s.method)?.label ?? s.method;
  return [m + (s.method === "lookup" && Array.isArray(s.lookup) ? ` (${s.lookup.length} rows)` : ""), s.factor ? `× ${s.factor}` : "", Array.isArray(s.bands) && s.bands.length ? `${s.bands.length} bands` : ""].filter(Boolean).join(" · ");
}
