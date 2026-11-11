import { Plus, Trash2 } from "lucide-react";
import { Btn, IconBtn, inputCls } from "@/components/kit";
import { cn } from "@/lib/utils";
import type { Body } from "@/lib/policy";

type Code = { cpt?: string; kind?: string; period?: string; max_units?: number; parent?: string; disabled?: boolean; requires?: Record<string, unknown>; [k: string]: unknown };
const PERIOD: Record<string, string> = { setup: "episode", supply: "rolling_30", management: "calendar_month", addon: "calendar_month" };
const NUM_COLS: { key: string; label: string; hint: string }[] = [
  { key: "minutes_min", label: "Min minutes", hint: "Minimum minutes in the period" },
  { key: "device_days_min", label: "Min days", hint: "Minimum counted device days (1 to 30)" },
  { key: "live_interactive_min", label: "Live interactions", hint: "Minimum live interactive contacts" },
  { key: "minutes_per_unit", label: "Min / unit", hint: "Add-on minutes per extra unit" },
];
const CONSENTS = ["program", "device_sharing"];
const SOURCES = ["device", "patient_reported", "clinician"];

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Guided editor for the most-edited rulepack fields. Everything else stays untouched in the JSON. */
export function RulepackGuided({ body, onChange, readOnly }: { body: Body; onChange?: (b: Body) => void; readOnly?: boolean }) {
  const codes = (Array.isArray(body.codes) ? body.codes : []) as Code[];
  const elig = obj(body.eligibility);
  const tr = obj(body.time_rules);
  const cfm = obj(tr.counts_for_management);
  const set = (patch: Body) => onChange?.({ ...body, ...patch });
  const setCode = (i: number, c: Code) => set({ codes: codes.map((x, j) => (j === i ? c : x)) });
  const setReq = (i: number, k: string, raw: string) => {
    const req = { ...obj(codes[i].requires) };
    if (raw === "") delete req[k];
    else req[k] = Number(raw);
    setCode(i, { ...codes[i], requires: req });
  };
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const dis = readOnly || !onChange;
  const cell = cn(inputCls, "h-8 px-2 text-xs tnum");

  return (
    <div className="space-y-4">
      <section aria-labelledby="rp-codes">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="rp-codes" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">CPT thresholds</h3>
          {!dis && <Btn size="sm" onClick={() => set({ codes: [...codes, { cpt: "", kind: "management", period: "calendar_month", max_units: 1, requires: { minutes_min: 20 } }] })} data-testid="button-add-code"><Plus className="h-3.5 w-3.5" />Code</Btn>}
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">CPT code thresholds for this rulepack</caption>
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <th scope="col" className="px-2 py-2">CPT</th><th scope="col" className="px-2 py-2">Kind</th><th scope="col" className="px-2 py-2">Max units</th>
                {NUM_COLS.map((c) => <th key={c.key} scope="col" className="px-2 py-2" title={c.hint}>{c.label}</th>)}
                <th scope="col" className="px-2 py-2">Parent</th><th scope="col" className="px-2 py-2">Off</th>{!dis && <th scope="col" className="sr-only">Remove</th>}
              </tr>
            </thead>
            <tbody>
              {codes.map((c, i) => {
                const req = obj(c.requires);
                const lbl = `code ${c.cpt || i + 1}`;
                return (
                  <tr key={i} className={cn("border-b border-border last:border-b-0", c.disabled && "opacity-55")} data-testid={`row-code-${i}`}>
                    <td className="px-2 py-1.5"><input aria-label={`CPT for row ${i + 1}`} className={cn(cell, "w-20 font-mono")} value={c.cpt ?? ""} disabled={dis} onChange={(e) => setCode(i, { ...c, cpt: e.target.value.trim() })} /></td>
                    <td className="px-2 py-1.5">
                      <select aria-label={`Kind for ${lbl}`} className={cn(cell, "w-28")} value={c.kind ?? "management"} disabled={dis} onChange={(e) => setCode(i, { ...c, kind: e.target.value, period: PERIOD[e.target.value] })}>
                        {Object.keys(PERIOD).map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5"><input type="number" min={1} aria-label={`Max units for ${lbl}`} className={cn(cell, "w-16")} value={c.max_units ?? ""} disabled={dis} onChange={(e) => setCode(i, { ...c, max_units: Number(e.target.value) })} /></td>
                    {NUM_COLS.map((col) => (
                      <td key={col.key} className="px-2 py-1.5"><input type="number" min={0} aria-label={`${col.hint} for ${lbl}`} placeholder="—" className={cn(cell, "w-16")} value={req[col.key] === undefined ? "" : String(req[col.key])} disabled={dis} onChange={(e) => setReq(i, col.key, e.target.value)} /></td>
                    ))}
                    <td className="px-2 py-1.5"><input aria-label={`Parent code for ${lbl}`} placeholder="—" className={cn(cell, "w-20 font-mono")} value={c.parent ?? ""} disabled={dis} onChange={(e) => { const n = { ...c }; if (e.target.value.trim()) n.parent = e.target.value.trim(); else delete n.parent; setCode(i, n); }} /></td>
                    <td className="px-2 py-1.5"><input type="checkbox" aria-label={`Disable ${lbl}`} className="h-4 w-4 accent-[hsl(var(--brand-orange))]" checked={!!c.disabled} disabled={dis} onChange={(e) => setCode(i, { ...c, disabled: e.target.checked })} /></td>
                    {!dis && <td className="px-1 py-1.5"><IconBtn label={`Remove ${lbl}`} onClick={() => set({ codes: codes.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></IconBtn></td>}
                  </tr>
                );
              })}
              {!codes.length && <tr><td colSpan={10} className="px-3 py-4 text-center text-xs text-muted-foreground">No codes. A rulepack needs at least one.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Period follows kind (setup: episode, supply: rolling 30 days, management and add-on: calendar month). Blank cells are omitted. Excludes, buckets and families are edited in JSON.</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="rounded-xl border border-border p-3" disabled={dis}>
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Eligibility</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Min chronic conditions<input type="number" min={0} max={20} className={cn(inputCls, "mt-1 h-8")} value={String(elig.min_chronic_conditions ?? 0)} onChange={(e) => set({ eligibility: { ...elig, min_chronic_conditions: Number(e.target.value) } })} /></label>
            <label className="text-xs">Device requirement
              <select className={cn(inputCls, "mt-1 h-8")} value={String(elig.device_requirement ?? "none")} onChange={(e) => set({ eligibility: { ...elig, device_requirement: e.target.value } })}>
                <option value="none">None</option><option value="supported">Supported</option><option value="fda_cleared">FDA cleared</option>
              </select>
            </label>
          </div>
          <div className="mt-3 text-xs">Required consents</div>
          <div className="mt-1 flex flex-wrap gap-3">{CONSENTS.map((c) => <Check key={c} label={c.replace("_", " ")} checked={list(elig.required_consents).includes(c)} onChange={() => set({ eligibility: { ...elig, required_consents: toggle(list(elig.required_consents), c) } })} />)}</div>
        </fieldset>
        <fieldset className="rounded-xl border border-border p-3" disabled={dis}>
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Counted sources and credentials</legend>
          <div className="text-xs">Data counted</div>
          <div className="mt-1 flex flex-wrap gap-3">{SOURCES.map((s) => <Check key={s} label={s.replace("_", " ")} checked={list(body.data_counted).includes(s)} onChange={() => set({ data_counted: toggle(list(body.data_counted), s) })} />)}</div>
          <ListInput label="Clinical staff credentials (general supervision)" value={list(cfm.clinical_staff_general_supervision)} onChange={(v) => set({ time_rules: { ...tr, counts_for_management: { ...cfm, clinical_staff_general_supervision: v } } })} />
          <ListInput label="Practitioner-only credentials" value={list(cfm.practitioner_only)} onChange={(v) => set({ time_rules: { ...tr, counts_for_management: { ...cfm, practitioner_only: v } } })} />
          <ListInput label="Counted activities" value={list(tr.activities)} onChange={(v) => set({ time_rules: { ...tr, activities: v } })} />
        </fieldset>
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <label className="inline-flex items-center gap-1.5 text-xs capitalize"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--brand-orange))]" checked={checked} onChange={onChange} />{label}</label>;
}
function ListInput({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <label className="mt-3 block text-xs">{label}
      <input className={cn(inputCls, "mt-1 h-8 font-mono text-xs")} defaultValue={value.join(", ")} key={value.join(",")} onBlur={(e) => onChange(splitList(e.target.value))} placeholder="comma separated" />
    </label>
  );
}
