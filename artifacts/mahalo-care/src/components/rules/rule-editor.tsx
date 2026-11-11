import { useMemo, useState } from "react";
import { AlertTriangle, Braces, Save, SlidersHorizontal } from "lucide-react";
import type { CareRecord } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Field, Pill, Tabs, inputCls } from "@/components/kit";
import { PROGRAMS, toInput, useSaveRecord } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RULE_KINDS, baseRule, canonicalize, changeKind, clean, describeRule, validateRule, type Rule, type RuleKind } from "@/lib/rule-schema";
import { RuleKindFields, RuleSharedFields } from "./rule-guided";
import { RulePreview } from "./rule-preview";

export type RuleDraft = { title: string; program: string; severity: string; status: string; description: string; rule: Rule };
const SEVERITIES = ["low", "medium", "high", "critical"];
const VIEWS = [{ id: "guided", label: "Guided" }, { id: "json", label: "Advanced JSON" }, { id: "preview", label: "Preview" }] as const;
type View = (typeof VIEWS)[number]["id"];

export function RuleEditor({ record, preset, readOnly, canPreview, onClose }: { record: CareRecord | null; preset?: RuleDraft; readOnly: boolean; canPreview: boolean; onClose: () => void }) {
  const init = useMemo(() => {
    if (record) {
      const c = canonicalize((record.metadata ?? {}) as Rule);
      return { title: record.title, program: record.program ?? "", severity: record.severity ?? "medium", status: record.status ?? "draft", description: record.description ?? "", rule: c.rule, aliases: c.aliases, conflicts: c.conflicts };
    }
    const d = preset ?? { title: "", program: "RPM", severity: "medium", status: "draft", description: "", rule: baseRule("threshold") };
    return { ...d, rule: clean(d.rule), aliases: [] as string[], conflicts: [] as string[] };
  }, [record, preset]);
  const [title, setTitle] = useState(init.title);
  const [program, setProgram] = useState(init.program);
  const [severity, setSeverity] = useState(init.severity);
  const [status, setStatus] = useState(init.status);
  const [description, setDescription] = useState(init.description);
  const [rule, setRule] = useState<Rule>(init.rule);
  const [text, setText] = useState(() => JSON.stringify(init.rule, null, 2));
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [view, setView] = useState<View>(readOnly ? "guided" : "guided");
  const [dropped, setDropped] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const { save, pending } = useSaveRecord();
  const dirty = JSON.stringify(rule) !== JSON.stringify(init.rule) || title !== init.title || program !== init.program || severity !== init.severity || status !== init.status || description !== init.description;

  const apply = (next: Rule) => { const c = clean(next); setRule(c); setText(JSON.stringify(c, null, 2)); setJsonErr(null); };
  const patch = (p: Rule) => { const n = { ...rule, ...p }; for (const k of Object.keys(n)) if (n[k] === undefined) delete n[k]; apply(n); };
  const onJson = (t: string) => {
    setText(t);
    try {
      const v = JSON.parse(t);
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Rule must be a JSON object");
      setRule(v); setJsonErr(null);
    } catch (e) { setJsonErr(e instanceof Error ? e.message : "Invalid JSON"); }
  };
  const canon = useMemo(() => canonicalize(rule), [rule]);
  const errors = useMemo(() => [
    ...(jsonErr ? [`JSON: ${jsonErr}`] : []),
    ...(!title.trim() ? ["title: required"] : []),
    ...canon.conflicts.map((c) => `aliases: ${c}`),
    ...(jsonErr ? [] : validateRule(canon.rule)),
  ], [jsonErr, title, canon]);

  const submit = () => {
    setShowErrors(true);
    if (errors.length) return;
    const data = { title: title.trim(), program: program || null, severity, status, description: description.trim(), metadata: canon.rule };
    save("rules", record ? toInput(record, data) : data, record?.id, () => onClose());
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{readOnly ? "Rule details" : record ? "Edit rule" : preset ? `New rule from example: ${preset.title}` : "New rule"}</DialogTitle>
          <DialogDescription>Provisional. A clinician must review every rule before it is relied on. Notifications are written to the demo console outbox only.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4" data-testid="rule-editor">
          {init.aliases.length > 0 && <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground" data-testid="rule-aliases">Stored with legacy field names: {init.aliases.join(", ")}. {readOnly ? "Shown here in canonical form." : "Saving writes the canonical names."}</p>}
          {preset && <p className="rounded-lg border border-dashed border-[hsl(38_80%_70%)] bg-[hsl(38_95%_96%)] px-3 py-2 text-[11px] text-[hsl(30_80%_28%)]">Example values are small provisional starting points, not clinical guidance. This rule is saved as a draft and is not enabled until you change its status.</p>}

          <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Title" className="sm:col-span-2"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-rule-title" /></Field>
            <Field label="Program"><select className={inputCls} value={program} onChange={(e) => setProgram(e.target.value)} data-testid="select-rule-program"><option value="">All programs</option>{PROGRAMS.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Severity"><select className={inputCls} value={severity} onChange={(e) => setSeverity(e.target.value)} data-testid="select-rule-severity">{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Status" hint="Only active rules evaluate"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-rule-status">{["draft", "active", "paused"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Rule kind" className="sm:col-span-3">
              <select className={inputCls} value={String(rule.kind ?? "")} disabled={readOnly || !!jsonErr} data-testid="select-rule-kind" onChange={(e) => { const r = changeKind(rule, e.target.value as RuleKind); setDropped(r.dropped); apply(r.rule); }}>
                {RULE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </Field>
            <p className="text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-4">{RULE_KINDS.find((k) => k.id === rule.kind)?.desc}</p>
            <Field label="Description" className="sm:col-span-2 lg:col-span-4"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-rule-description" /></Field>
          </fieldset>
          {dropped.length > 0 && <p className="text-[11px] text-[hsl(30_80%_28%)]" role="status">Kind changed. Reset or removed incompatible fields: {dropped.join(", ")}.</p>}

          <div className="rounded-lg bg-secondary/50 px-3 py-2 text-sm" data-testid="rule-summary"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Reads as </span>{jsonErr ? "Fix the JSON to see a summary" : describeRule(canon.rule)}</div>

          <Tabs value={view} onChange={setView} tabs={VIEWS.filter((v) => v.id !== "preview" || (record && canPreview)).map((v) => ({ id: v.id, label: v.label }))} />

          {view === "guided" && (
            jsonErr ? <p className="text-xs text-destructive">Guided view needs valid JSON. {jsonErr}</p> : (
              <fieldset disabled={readOnly} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><RuleKindFields r={rule} set={patch} /></div>
                <div className="border-t border-border pt-3"><div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.6} />Ownership and notification</div><RuleSharedFields r={rule} set={patch} /></div>
              </fieldset>
            )
          )}
          {view === "json" && (
            <div>
              <label htmlFor="rule-json" className="mb-1 flex items-center gap-1.5 text-xs font-medium"><Braces className="h-3.5 w-3.5" strokeWidth={1.6} />Rule metadata JSON</label>
              <textarea id="rule-json" readOnly={readOnly} spellCheck={false} aria-invalid={!!jsonErr} aria-describedby="rule-json-status" className={cn(inputCls, "h-80 resize-y py-2 font-mono text-[12px] leading-relaxed", jsonErr && "border-destructive/50")} value={readOnly ? JSON.stringify(canon.rule, null, 2) : text} onChange={(e) => onJson(e.target.value)} data-testid="input-rule-json" />
              <p id="rule-json-status" aria-live="polite" className={cn("mt-1 text-[11px]", jsonErr ? "text-destructive" : "text-muted-foreground")}>{jsonErr ? `JSON: ${jsonErr}` : "Parses. Legacy aliases are accepted here and saved under canonical names."}</p>
            </div>
          )}
          {view === "preview" && record && <RulePreview ruleId={record.id} dirty={dirty} />}

          {!readOnly && (showErrors || jsonErr) && errors.length > 0 && (
            <div role="alert" className="rounded-xl border border-destructive/25 bg-[hsl(352_80%_98.5%)] p-3 text-xs text-destructive" data-testid="rule-errors">
              <div className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.6} />Fix before saving</div>
              <ul className="mt-1 list-disc pl-5 font-mono text-[11px]">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-2">
          <span className="mr-auto"><Pill tone="amber">Provisional · review required</Pill></span>
          <Btn variant="ghost" onClick={onClose}>{readOnly ? "Close" : "Cancel"}</Btn>
          {!readOnly && <Btn variant="primary" onClick={submit} disabled={pending} data-testid="button-save-rule"><Save className="h-4 w-4" />{pending ? "Saving…" : "Save rule"}</Btn>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
