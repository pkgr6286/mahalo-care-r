import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Btn, IconBtn, inputCls } from "@/components/kit";
import { cn } from "@/lib/utils";
import { CHANNELS, LOINC, OPS, OP_LABEL, ROLES, type Rule } from "@/lib/rule-schema";

type SetFn = (patch: Rule) => void;
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rule) : {});
const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));
const listStr = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "");
const splitList = (s: string) => { const a = s.split(",").map((x) => x.trim()).filter(Boolean); return a.length ? a : undefined; };
const roleLabel = (r: string) => r.replace(/_/g, " ");

export function F({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={cn("block text-xs", className)}><span className="mb-1 block font-medium text-foreground/80">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}</label>;
}
function Num({ r, k, set, label, hint, step = "any", min }: { r: Rule; k: string; set: SetFn; label: string; hint?: string; step?: string; min?: number }) {
  return <F label={label} hint={hint}><input type="number" step={step} min={min} className={inputCls} value={r[k] === undefined ? "" : String(r[k])} onChange={(e) => set({ [k]: numOrUndef(e.target.value) })} data-testid={`rule-${k}`} /></F>;
}
function Sel({ r, k, set, label, opts, hint, blank }: { r: Rule; k: string; set: SetFn; label: string; opts: readonly (string | { v: string; l: string })[]; hint?: string; blank?: string }) {
  return (
    <F label={label} hint={hint}>
      <select className={inputCls} value={r[k] === undefined ? "" : String(r[k])} onChange={(e) => set({ [k]: e.target.value || undefined })} data-testid={`rule-${k}`}>
        {blank !== undefined && <option value="">{blank}</option>}
        {opts.map((o) => typeof o === "string" ? <option key={o} value={o}>{OP_LABEL[o] ? `${OP_LABEL[o]} (${o})` : o.replace(/_/g, " ")}</option> : <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </F>
  );
}
function Txt({ r, k, set, label, hint, list }: { r: Rule; k: string; set: SetFn; label: string; hint?: string; list?: string }) {
  return <F label={label} hint={hint}><input className={inputCls} list={list} value={r[k] === undefined ? "" : String(r[k])} onChange={(e) => set({ [k]: e.target.value.trim() || undefined })} data-testid={`rule-${k}`} /></F>;
}
function ListF({ r, k, set, label, hint }: { r: Rule; k: string; set: SetFn; label: string; hint?: string }) {
  return <F label={label} hint={hint ?? "Comma separated"}><input className={inputCls} defaultValue={listStr(r[k])} key={listStr(r[k])} onBlur={(e) => set({ [k]: splitList(e.target.value) })} data-testid={`rule-${k}`} /></F>;
}
const LoincList = () => <datalist id="loinc-codes">{LOINC.map((l) => <option key={l.code} value={l.code}>{l.label} ({l.unit})</option>)}</datalist>;

function Comparison({ r, set }: { r: Rule; set: SetFn }) {
  const outside = r.op === "outside";
  return (
    <>
      <Sel r={r} k="op" set={(p) => set(p.op === "outside" ? { ...p, value: undefined } : { ...p, low: undefined, high: undefined })} label="Operator" opts={OPS} />
      {outside ? <><Num r={r} k="low" set={set} label="Low bound" /><Num r={r} k="high" set={set} label="High bound" /></> : <Num r={r} k="value" set={set} label="Value" />}
    </>
  );
}

function AnyOf({ r, set }: { r: Rule; set: SetFn }) {
  const list = (Array.isArray(r.any_of) ? r.any_of : []) as Rule[];
  const up = (i: number, p: Rule) => {
    const n = { ...list[i], ...p };
    if (p.op === "outside") delete n.value; else if (p.op) { delete n.low; delete n.high; }
    for (const k of Object.keys(n)) if (n[k] === undefined) delete n[k];
    set({ any_of: list.map((c, j) => (j === i ? n : c)) });
  };
  return (
    <div className="sm:col-span-2 lg:col-span-3 space-y-2">
      {list.map((c, i) => (
        <div key={i} className="grid grid-cols-[1fr_110px_1fr_auto] items-end gap-2 rounded-lg border border-border p-2" data-testid={`rule-anyof-${i}`}>
          <F label={`Condition ${i + 1} LOINC`}><input className={inputCls} list="loinc-codes" value={String(c.loinc ?? "")} onChange={(e) => up(i, { loinc: e.target.value.trim() })} /></F>
          <F label="Operator"><select className={inputCls} value={String(c.op ?? "gte")} onChange={(e) => up(i, { op: e.target.value })}>{OPS.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}</select></F>
          {c.op === "outside" ? (
            <div className="grid grid-cols-2 gap-2"><F label="Low"><input type="number" className={inputCls} value={c.low === undefined ? "" : String(c.low)} onChange={(e) => up(i, { low: numOrUndef(e.target.value) })} /></F><F label="High"><input type="number" className={inputCls} value={c.high === undefined ? "" : String(c.high)} onChange={(e) => up(i, { high: numOrUndef(e.target.value) })} /></F></div>
          ) : <F label="Value"><input type="number" className={inputCls} value={c.value === undefined ? "" : String(c.value)} onChange={(e) => up(i, { value: numOrUndef(e.target.value) })} /></F>}
          <IconBtn label={`Remove condition ${i + 1}`} onClick={() => set({ any_of: list.length > 1 ? list.filter((_, j) => j !== i) : undefined })}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
        </div>
      ))}
      <Btn size="sm" onClick={() => set({ any_of: [...list, { loinc: "8480-6", op: "gte", value: 180 }] })} disabled={list.length >= 10} data-testid="button-add-anyof"><Plus className="h-3.5 w-3.5" />Condition</Btn>
    </div>
  );
}

/** Kind-specific guided fields. Writes canonical field names only. */
export function RuleKindFields({ r, set }: { r: Rule; set: SetFn }) {
  const anyOf = Array.isArray(r.any_of);
  switch (r.kind) {
    case "threshold":
      return (
        <>
          <LoincList />
          <label className="flex items-center gap-2 text-xs sm:col-span-2 lg:col-span-3"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--brand-orange))]" checked={anyOf} onChange={(e) => set(e.target.checked ? { any_of: [{ loinc: r.loinc ?? "8480-6", op: r.op ?? "gte", ...(r.op === "outside" ? { low: r.low, high: r.high } : { value: r.value ?? 0 }) }], loinc: undefined, op: undefined, value: undefined, low: undefined, high: undefined } : { any_of: undefined, loinc: "8480-6", op: "gte", value: 180 })} data-testid="rule-use-anyof" />Match any of several readings (any_of)</label>
          {anyOf ? <AnyOf r={r} set={set} /> : <><Txt r={r} k="loinc" set={set} label="LOINC" list="loinc-codes" hint="Pick from the list or type a code" /><Comparison r={r} set={set} /></>}
          <Num r={r} k="confirm_with_n_readings" set={set} label="Confirm with N readings" step="1" min={1} hint="1 to 20" />
          <Num r={r} k="within_hours" set={set} label="Within hours" hint="Window for confirming readings" />
        </>
      );
    case "trend":
      return (<><LoincList /><Txt r={r} k="loinc" set={set} label="LOINC" list="loinc-codes" /><Sel r={r} k="stat" set={set} label="Statistic" opts={["mean", "slope", "max", "delta"]} /><Num r={r} k="window_days" set={set} label="Window days" step="1" min={1} /><Comparison r={r} set={set} /><Num r={r} k="min_points" set={set} label="Minimum points" step="1" min={1} /></>);
    case "missing_data":
      return (<><Sel r={r} k="stream" set={set} label="Stream" opts={["device", "epro", "adherence"]} /><Num r={r} k="days_without" set={set} label="Days without data" /><Num r={r} k="only_if_enrolled_days_gte" set={set} label="Only if enrolled ≥ days" /><Txt r={r} k="instrument_key" set={set} label="Instrument key (optional)" hint="ePRO only, e.g. phq9" /></>);
    case "adherence":
      return (<><Txt r={r} k="item_kind" set={set} label="Item kind" hint="medication, exercise, education…" /><Num r={r} k="window_days" set={set} label="Window days" step="1" min={1} /><Num r={r} k="completion_rate_lt" set={set} label="Completion rate below" hint="0 to 1, e.g. 0.6 = 60%" /><Num r={r} k="missed_consecutive_gte" set={set} label="Consecutive misses ≥" step="1" min={1} /><ListF r={r} k="barrier_in" set={set} label="Barrier in" hint="Comma separated barrier labels" /><p className="text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-3">At least one of completion rate, consecutive misses or barriers is required.</p></>);
    case "score": {
      const mode = r.item_flag ? "item" : Array.isArray(r.band_in) ? "band" : r.change_from_prior_gte !== undefined ? "change" : "total";
      const reset = { op: undefined, value: undefined, low: undefined, high: undefined, band_in: undefined, change_from_prior_gte: undefined, item_flag: undefined };
      const f = obj(r.item_flag);
      return (
        <>
          <Txt r={r} k="instrument_key" set={set} label="Instrument key" hint="e.g. phq9, gad7, promis_pi" />
          <F label="Condition">
            <select className={inputCls} value={mode} data-testid="rule-score-mode" onChange={(e) => {
              const m = e.target.value;
              set({ ...reset, ...(m === "total" ? { op: "gte", value: 10 } : m === "band" ? { band_in: ["severe"] } : m === "change" ? { change_from_prior_gte: 5 } : { item_flag: { index: 9, op: "gt", value: 0 } }) });
            }}>
              <option value="total">Total score comparison</option><option value="band">Band in</option><option value="change">Change from prior/baseline</option><option value="item">Single item flag</option>
            </select>
          </F>
          {mode === "total" && <Comparison r={r} set={set} />}
          {mode === "band" && <ListF r={r} k="band_in" set={set} label="Bands" />}
          {mode === "change" && <><Num r={r} k="change_from_prior_gte" set={set} label="Change ≥" /><Sel r={r} k="change_direction" set={set} label="Direction" opts={["increase", "decrease"]} /><Sel r={r} k="compare_to" set={set} label="Compare to" opts={["prior", "baseline"]} /></>}
          {mode === "item" && (
            <div className="grid grid-cols-3 gap-2 sm:col-span-2 lg:col-span-3">
              <F label="Item number (1-based)"><input type="number" min={1} step={1} className={inputCls} value={f.index === undefined ? "" : String(f.index)} onChange={(e) => set({ item_flag: { ...f, index: numOrUndef(e.target.value) } })} data-testid="rule-item-index" /></F>
              <F label="Operator"><select className={inputCls} value={String(f.op ?? "gt")} onChange={(e) => set({ item_flag: { ...f, op: e.target.value } })}>{OPS.filter((o) => o !== "outside").map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}</select></F>
              <F label="Value"><input type="number" className={inputCls} value={f.value === undefined ? "" : String(f.value)} onChange={(e) => set({ item_flag: { ...f, value: numOrUndef(e.target.value) } })} data-testid="rule-item-value" /></F>
            </div>
          )}
        </>
      );
    }
    case "time_budget":
    case "device_days_at_risk": {
      const tb = r.kind === "time_budget";
      return (<><Sel r={r} k="program_key" set={set} label="Program" opts={["RPM", "RTM", "CCM", "PCM", "BHI"]} blank="Any" /><Txt r={r} k="code" set={set} label="CPT code" hint="Five characters, e.g. 99490" /><Num r={r} k="days_left_lte" set={set} label="Days left in period ≤" step="1" min={0} />{tb ? <Num r={r} k="minutes_short_gte" set={set} label="Minutes short ≥" /> : <Num r={r} k="shortfall_gte" set={set} label="Days short ≥" />}<Num r={r} k="value" set={set} label={tb ? "Target minutes (fallback)" : "Target device days (fallback)"} hint="Used when the program policy has no target" /></>);
    }
    default:
      return <p className="text-xs text-muted-foreground">Choose a kind to see its fields.</p>;
  }
}

export function RuleSharedFields({ r, set }: { r: Rule; set: SetFn }) {
  const n = obj(r.notify);
  const ch = Array.isArray(n.channels) ? (n.channels as string[]) : ["in_app"];
  const setN = (p: Rule) => { const next = { ...n, ...p }; for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]; set({ notify: next }); };
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Sel r={r} k="owner_role" set={set} label="Owner role" opts={ROLES.map((x) => ({ v: x, l: roleLabel(x) }))} blank="Unassigned" />
      <Num r={r} k="escalate_after_hours" set={set} label="Escalate after hours" />
      <Num r={r} k="deduplication_window_minutes" set={set} label="Deduplicate within minutes" step="1" min={1} />
      <fieldset className="sm:col-span-2 lg:col-span-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-medium">Notifications <span className="font-normal text-muted-foreground">(demo: written to the console outbox only, never delivered)</span></legend>
        <div className="flex flex-wrap gap-4">
          {CHANNELS.map((c) => <label key={c} className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--brand-orange))]" checked={ch.includes(c)} onChange={() => setN({ channels: ch.includes(c) ? ch.filter((x) => x !== c) : [...ch, c] })} data-testid={`rule-channel-${c}`} />{c.replace("_", "-")}</label>)}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <F label="Quiet period minutes"><input type="number" min={0} step={1} className={inputCls} value={n.quiet_period_minutes === undefined ? "" : String(n.quiet_period_minutes)} onChange={(e) => setN({ quiet_period_minutes: numOrUndef(e.target.value) })} /></F>
          <F label="On-call role"><select className={inputCls} value={String(n.on_call_role ?? "")} onChange={(e) => setN({ on_call_role: e.target.value || undefined })}><option value="">None</option>{ROLES.map((x) => <option key={x} value={x}>{roleLabel(x)}</option>)}</select></F>
          <label className="flex items-center gap-2 self-end pb-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--brand-orange))]" checked={n.critical_bypass_quiet !== false} onChange={(e) => setN({ critical_bypass_quiet: e.target.checked })} />Critical bypasses quiet period</label>
        </div>
      </fieldset>
      <Txt r={r} k="version" set={set} label="Rule version" />
      <Txt r={r} k="sourceRef" set={set} label="Source reference" hint="Protocol or guideline this follows" />
      <label className="flex items-center gap-2 self-end pb-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--brand-orange))]" checked={r.reviewRequired !== false} onChange={(e) => set({ reviewRequired: e.target.checked })} />Clinician review required</label>
    </div>
  );
}
