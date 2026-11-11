import { useEffect, useRef, useState } from "react";
import { ChevronDown, RotateCcw, Save, Search } from "lucide-react";
import type { WorklistPageOptions } from "@workspace/api-client-react";
import { Btn, inputCls } from "@/components/kit";
import { PROGRAMS } from "@/lib/api";
import { roleLabel } from "@/pages/account";
import { type WlFilters, type WlKind } from "@/lib/worklist";
import { cn } from "@/lib/utils";

type Props = { kind: WlKind; f: WlFilters; options?: WorklistPageOptions; onChange: (p: Partial<WlFilters>) => void; onSave: () => void; onReset: () => void; saving: boolean; dirty: boolean };
const sel = cn(inputCls, "w-auto min-w-[8.5rem] pr-7");

export function WorklistFilters({ kind, f, options, onChange, onSave, onReset, saving, dirty }: Props) {
  const [q, setQ] = useState(f.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  useEffect(() => { setQ(f.q); }, [f.q]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const typeQ = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => changeRef.current({ q: v }), 350);
  };
  const programs = options?.programs?.length ? options.programs : [...PROGRAMS];
  const showPeriod = kind === "at_risk";
  return (
    <div className="space-y-2" data-testid="worklist-filters">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
          <input type="search" aria-label="Search patient, MRN or title" className={cn(inputCls, "pl-9")} placeholder="Patient, MRN, title" value={q} maxLength={200} onChange={(e) => typeQ(e.target.value)} data-testid="input-wl-search" />
        </div>
        <select aria-label="Status" className={sel} value={f.status} onChange={(e) => onChange({ status: e.target.value as WlFilters["status"] })} data-testid="select-wl-status">
          <option value="open">Open</option><option value="closed">Closed</option><option value="all">All states</option>
        </select>
        <select aria-label="Program" className={sel} value={f.program} onChange={(e) => onChange({ program: e.target.value })} data-testid="select-wl-program">
          <option value="">All programs</option>{programs.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <LocationPicker value={f.locations} options={options?.locations ?? []} onChange={(locations) => onChange({ locations })} />
        <select aria-label="Assignee" className={sel} value={f.assignee} onChange={(e) => onChange({ assignee: e.target.value })} data-testid="select-wl-assignee">
          <option value="">Anyone</option><option value="me">Me</option><option value="unassigned">Unassigned</option>
          {(options?.assignees ?? []).map((a) => <option key={a.id} value={a.id}>{a.name} · {roleLabel(a.role)}</option>)}
        </select>
        <select aria-label="Owner role" className={sel} value={f.ownerRole} onChange={(e) => onChange({ ownerRole: e.target.value })} data-testid="select-wl-role">
          <option value="">Any role</option>{(options?.ownerRoles ?? []).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
        </select>
        {showPeriod && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Billing month
            <input type="month" aria-label="Billing month" className={cn(inputCls, "w-auto")} value={f.period} onChange={(e) => onChange({ period: e.target.value })} data-testid="input-wl-period" />
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {kind === "device_issues" ? <span className="text-muted-foreground" data-testid="note-wl-device-inactive">Includes inactive patients until their equipment is returned.</span> : <label className="inline-flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" className="accent-[hsl(var(--primary))]" checked={f.includeInactive} onChange={(e) => onChange({ includeInactive: e.target.checked })} data-testid="check-wl-inactive" />Include inactive patients</label>}
        <span className="ml-auto flex items-center gap-1.5">
          {dirty && <span className="text-[11px] text-muted-foreground" data-testid="text-wl-unsaved">Unsaved view changes</span>}
          <Btn size="sm" variant="ghost" onClick={onReset} data-testid="button-wl-reset"><RotateCcw className="h-3.5 w-3.5" strokeWidth={1.6} />Reset</Btn>
          <Btn size="sm" onClick={onSave} disabled={saving || !dirty} data-testid="button-wl-save"><Save className="h-3.5 w-3.5" strokeWidth={1.6} />{saving ? "Saving…" : "Save view"}</Btn>
        </span>
      </div>
    </div>
  );
}

function LocationPicker({ value, options, onChange }: { value: string[]; options: string[]; onChange: (v: string[]) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const all = Array.from(new Set([...options, ...value]));
  const label = !value.length ? "All locations" : value.length === 1 ? value[0] : value.length + " locations";
  const toggle = (l: string) => onChange(value.includes(l) ? value.filter((x) => x !== l) : [...value, l]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <details ref={ref} className="relative" data-testid="picker-wl-locations">
      <summary className={cn(inputCls, "flex w-auto min-w-[9rem] cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden")} aria-label="Locations">
        <span className="truncate">{label}</span><ChevronDown className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
      </summary>
      <div className="absolute z-30 mt-1 max-h-64 w-60 overflow-auto rounded-xl border border-border bg-card p-1.5 shadow-[var(--shadow-lg)]">
        {!all.length && <p className="px-2 py-1.5 text-xs text-muted-foreground">No locations in your scope yet.</p>}
        {all.map((l) => (
          <label key={l} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary">
            <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={value.includes(l)} onChange={() => toggle(l)} data-testid={"check-wl-location-" + l} />{l}
          </label>
        ))}
        {value.length > 0 && <button type="button" className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-primary hover:bg-secondary" onClick={() => onChange([])}>Clear locations</button>}
      </div>
    </details>
  );
}
