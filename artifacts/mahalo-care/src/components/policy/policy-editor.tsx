import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Braces, FlaskConical, Save, SlidersHorizontal, X } from "lucide-react";
import {
  getGetProgramPolicyQueryKey, getListProgramPoliciesQueryKey, useCreateProgramPolicy, useUpdateProgramPolicy, useValidateProgramPolicy,
  type ProgramPolicy, type ProgramPolicyInput, type ProgramPolicyValidation,
} from "@workspace/api-client-react";
import { Btn, Field, Panel, Pill, ProgramTag, Tabs, inputCls } from "@/components/kit";
import { PROGRAMS } from "@/lib/api";
import { cn } from "@/lib/utils";
import { POLICY_KINDS, kindLabel, policyErrors, starterBody, suggestVersion, syncBody, today, type Body, type PolicyKind, type PolicyProgram } from "@/lib/policy";
import { RulepackGuided } from "./rulepack-guided";
import { ErrorList, ValidationResult } from "./validation-result";

export function PolicyEditor({ initial, preset, bases, onSaved, onCancel }: {
  initial?: ProgramPolicy;
  preset?: { kind: PolicyKind; program: PolicyProgram };
  bases: ProgramPolicy[];
  onSaved: (p: ProgramPolicy) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<PolicyKind>(initial?.kind ?? preset?.kind ?? "rulepack");
  const [program, setProgram] = useState<PolicyProgram>(initial?.program ?? preset?.program ?? "RPM");
  const [version, setVersion] = useState(initial?.version ?? suggestVersion());
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? today());
  const [payer, setPayer] = useState(initial?.payer ?? "");
  const [sourceRef, setSourceRef] = useState(initial?.sourceRef ?? "");
  const [text, setText] = useState(() => JSON.stringify(initial?.body ?? starterBody(kind, program, version, effectiveFrom), null, 2));
  const [view, setView] = useState<"guided" | "json">(kind === "rulepack" ? "guided" : "json");
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<ProgramPolicyValidation | null>(null);

  const parsed = useMemo<{ body?: Body; err?: string }>(() => {
    try {
      const b = JSON.parse(text);
      return b && typeof b === "object" && !Array.isArray(b) ? { body: b } : { err: "Body must be a JSON object" };
    } catch (e) { return { err: e instanceof Error ? e.message : "Invalid JSON" }; }
  }, [text]);

  const baseOptions = bases.filter((b) => b.kind === "rulepack" && b.program === program && (b.status === "published" || b.status === "bundled"));
  const baseId = kind === "payer_override" && parsed.body ? String(parsed.body.basePolicyId ?? "") : "";
  const setBody = (b: Body) => { setText(JSON.stringify(b, null, 2)); setResult(null); };

  const resetStarter = (k: PolicyKind, pr: PolicyProgram) => {
    setText(JSON.stringify(starterBody(k, pr, version, effectiveFrom, baseOptions.find((b) => b.program === pr)?.id ?? ""), null, 2));
    setView(k === "rulepack" ? "guided" : "json"); setResult(null); setErrors([]);
  };

  const input = (): ProgramPolicyInput | null => {
    if (!parsed.body) { setErrors([`JSON: ${parsed.err}`]); return null; }
    const local: string[] = [];
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(version)) local.push("version: letters, numbers, dot, dash or underscore; up to 40 characters");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) local.push("effectiveFrom: use YYYY-MM-DD");
    if (kind === "payer_override" && !payer.trim()) local.push("payer: required for payer overrides");
    if (kind === "payer_override" && !baseId) local.push("basePolicyId: choose a published or bundled base rulepack");
    if (local.length) { setErrors(local); return null; }
    return { kind, program, version, effectiveFrom, payer: kind === "payer_override" ? payer.trim() : "", sourceRef: sourceRef.trim(), body: syncBody(kind, program, version, effectiveFrom, parsed.body) };
  };

  const validate = useValidateProgramPolicy();
  const create = useCreateProgramPolicy();
  const update = useUpdateProgramPolicy();
  const saving = create.isPending || update.isPending;

  const runValidate = () => {
    const data = input(); if (!data) return;
    setErrors([]);
    validate.mutate({ data }, { onSuccess: (v) => setResult(v), onError: (e) => { setResult(null); setErrors(policyErrors(e)); } });
  };
  const save = () => {
    const data = input(); if (!data) return;
    setErrors([]);
    const done = (p: ProgramPolicy) => {
      qc.invalidateQueries({ queryKey: getListProgramPoliciesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetProgramPolicyQueryKey(p.id) });
      onSaved(p);
    };
    const fail = (e: unknown) => setErrors(policyErrors(e));
    if (initial) update.mutate({ policyId: initial.id, data }, { onSuccess: done, onError: fail });
    else create.mutate({ data }, { onSuccess: done, onError: fail });
  };

  return (
    <Panel
      title={initial ? `Edit draft ${initial.version}` : "New draft"}
      sub={<span className="inline-flex items-center gap-2"><ProgramTag p={program} />{kindLabel(kind)}<Pill tone="amber">Provisional</Pill></span>}
      action={<Btn variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-edit"><X className="h-3.5 w-3.5" />Close</Btn>}
    >
      <div className="space-y-4" data-testid="policy-editor">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Kind">
            <select className={inputCls} value={kind} disabled={!!initial} data-testid="select-kind" onChange={(e) => { const k = e.target.value as PolicyKind; setKind(k); resetStarter(k, program); }}>
              {POLICY_KINDS.map((k) => <option key={k.id} value={k.id}>{k.short}</option>)}
            </select>
          </Field>
          <Field label="Program">
            <select className={inputCls} value={program} disabled={!!initial} data-testid="select-program" onChange={(e) => { const pr = e.target.value as PolicyProgram; setProgram(pr); if (!initial) resetStarter(kind, pr); }}>
              {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Version" hint="Unique per program and kind">
            <input className={cn(inputCls, "font-mono")} value={version} onChange={(e) => setVersion(e.target.value)} data-testid="input-version" />
          </Field>
          <Field label="Effective from">
            <input type="date" className={inputCls} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} data-testid="input-effective" />
          </Field>
          {kind === "payer_override" && (
            <>
              <Field label="Payer" hint="Required for overrides only">
                <input className={inputCls} value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="e.g. HMSA Akamai Advantage" data-testid="input-payer" />
              </Field>
              <Field label="Base rulepack" hint="Published or bundled only">
                <select className={inputCls} value={baseId} data-testid="select-base" onChange={(e) => parsed.body && setBody({ ...parsed.body, basePolicyId: e.target.value })} disabled={!parsed.body}>
                  <option value="">Choose a base</option>
                  {baseOptions.map((b) => <option key={b.id} value={b.id}>{b.version} · {b.status}</option>)}
                </select>
              </Field>
            </>
          )}
          <Field label="Source reference" hint="Document or guidance this version follows. Required at review." className="sm:col-span-2 lg:col-span-3">
            <input className={inputCls} value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="e.g. Payer bulletin title and date, or internal policy doc" data-testid="input-sourceref" />
          </Field>
        </div>

        {kind === "payer_override" && !baseOptions.length && <p className="text-xs text-[hsl(30_80%_28%)]">No published or bundled {program} rulepack exists to tighten yet.</p>}

        <div>
          {kind === "rulepack" && (
            <Tabs className="mb-3" value={view} onChange={setView} tabs={[{ id: "guided" as const, label: "Guided thresholds" }, { id: "json" as const, label: "Full JSON" }]} />
          )}
          {view === "guided" && kind === "rulepack" ? (
            parsed.body ? <RulepackGuided body={parsed.body} onChange={setBody} /> : <ErrorList title="Guided view unavailable until the JSON parses" errors={[parsed.err ?? ""]} />
          ) : (
            <div>
              <label htmlFor="policy-json" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground/80"><Braces className="h-3.5 w-3.5" strokeWidth={1.6} />Body JSON</label>
              <textarea
                id="policy-json" spellCheck={false} aria-invalid={!!parsed.err} aria-describedby="policy-json-status"
                className={cn(inputCls, "h-[420px] resize-y py-2 font-mono text-[12px] leading-relaxed", parsed.err && "border-destructive/50")}
                value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} data-testid="input-body-json"
                onKeyDown={(e) => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); const t = e.currentTarget; const s = t.selectionStart; setText(text.slice(0, s) + "  " + text.slice(t.selectionEnd)); requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2)); } }}
              />
              <div id="policy-json-status" className={cn("mt-1 text-[11px]", parsed.err ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
                {parsed.err ? `JSON: ${parsed.err}` : "JSON parses. Tab inserts two spaces; Shift+Tab leaves the field."}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Btn size="sm" variant="ghost" onClick={() => parsed.body && setText(JSON.stringify(parsed.body, null, 2))} disabled={!parsed.body}>Format</Btn>
                {!initial && <Btn size="sm" variant="ghost" onClick={() => resetStarter(kind, program)}><SlidersHorizontal className="h-3.5 w-3.5" />Reset to starter</Btn>}
              </div>
            </div>
          )}
        </div>

        <ErrorList errors={errors} />
        {result && <ValidationResult v={result} />}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <span className="mr-auto text-[11px] text-muted-foreground">Drafts stay editable until reviewed. Review freezes the body.</span>
          <Btn onClick={runValidate} disabled={validate.isPending} data-testid="button-validate"><FlaskConical className="h-4 w-4" />{validate.isPending ? "Checking…" : "Validate and preview"}</Btn>
          <Btn variant="primary" onClick={save} disabled={saving} data-testid="button-save-draft"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save draft"}</Btn>
        </div>
      </div>
    </Panel>
  );
}
