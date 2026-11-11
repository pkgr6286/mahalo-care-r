import { useMemo, useState } from "react";
import { Gauge } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CareRecord, Patient } from "@workspace/api-client-react";
import { EmptyState, Panel, SimLabel } from "@/components/kit";
import { fmtDate, fmtDateTime, mNum, mStr } from "@/lib/api";
import { cn } from "@/lib/utils";

/* One series = one measurement on one scale. Different metrics are never plotted together. */
type Point = { t: string; label: string; v: number; v2?: number };
type Series = { id: string; label: string; unit: string; points: Point[]; excluded: number; practice?: boolean; syntheticData?: boolean; note?: string; domain?: [number | "auto", number | "auto"]; refs?: { y: number; color: string }[]; secondary?: string };

const LOINC: Record<string, string> = { "8480-6": "bp", "8462-4": "bp_dia", "29463-7": "weight", "2339-0": "glucose", "72514-3": "pain" };
const when = (r: CareRecord) => r.date ?? r.createdAt;

function classify(r: CareRecord): string | null {
  const l = mStr(r, "loinc") || mStr(r, "code");
  if (l && LOINC[l]) return LOINC[l];
  if (mNum(r, "diastolic") !== undefined || (r.unit ?? "").toLowerCase() === "mmhg") return "bp";
  const t = r.title.toLowerCase();
  if (t.includes("weight")) return "weight";
  if (t.includes("glucose")) return "glucose";
  if (t.includes("pain")) return "pain";
  return null;
}

/** Keep the dominant unit; points in any other unit are counted, not converted. */
function oneUnit(rows: CareRecord[]) {
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(r.unit ?? "", (counts.get(r.unit ?? "") ?? 0) + 1));
  const unit = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const kept = rows.filter((r) => (r.unit ?? "") === unit && typeof r.value === "number" && r.metadata?.valid !== false);
  return { unit, kept, excluded: rows.length - kept.length };
}
const pt = (r: CareRecord, v2?: number): Point => ({ t: when(r), label: fmtDate(when(r), "MMM d"), v: r.value as number, v2 });

/** JSON with object keys sorted at every depth (arrays keep order). */
function stableStringify(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}
function fnv(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
/**
 * Deterministic key over the material content only: identity, version, language, wording,
 * instructions, labels, range, scoring and demo flag. Review timestamps, proof hashes and
 * fingerprint versions are excluded. Returns null if the snapshot is incomplete.
 */
function semanticKey(r: CareRecord): string | null {
  const sn = r.metadata?.instrumentSnapshot as Record<string, unknown> | undefined;
  if (!sn || typeof sn !== "object") return null;
  const inner = (sn.metadata && typeof sn.metadata === "object" ? sn.metadata : {}) as Record<string, unknown>;
  const pick = (k: string) => (sn[k] !== undefined ? sn[k] : inner[k]);
  const questions = pick("questions");
  const range = pick("range") as { min?: unknown; max?: unknown } | undefined;
  const version = pick("contentVersion") ?? pick("version");
  if (!Array.isArray(questions) || !questions.length || !range || typeof range.min !== "number" || typeof range.max !== "number" || version === undefined || version === null || version === "") return null;
  return stableStringify({
    id: pick("id") ?? pick("instrumentId") ?? mStr(r, "instrumentId") ?? null,
    key: pick("key") ?? mStr(r, "instrument"),
    contentVersion: String(version),
    language: pick("language") ?? null,
    questions: questions.map((q) => (typeof q === "string" ? q.trim() : q)),
    instructions: typeof pick("instructions") === "string" ? (pick("instructions") as string).trim() : null,
    answerLabels: pick("answerLabels") ?? null,
    range: { min: range.min, max: range.max },
    scoring: pick("scoring") ?? null,
    nonValidatedDemo: pick("nonValidatedDemo") === true,
  });
}

export function buildSeries(obs: CareRecord[], responses: CareRecord[]): Series[] {
  const by: Record<string, CareRecord[]> = {};
  for (const r of obs) { const k = classify(r); if (k) (by[k] ??= []).push(r); }
  const sort = (a: CareRecord, b: CareRecord) => when(a).localeCompare(when(b));
  const out: Series[] = [];
  if (by.bp?.length) {
    const dia = new Map((by.bp_dia ?? []).map((r) => [when(r), r.value as number]));
    const { unit, kept, excluded } = oneUnit(by.bp.sort(sort));
    out.push({ id: "bp", label: "Blood pressure", unit: unit || "mmHg", points: kept.map((r) => pt(r, mNum(r, "diastolic") ?? dia.get(when(r)))), excluded, domain: [40, 220], refs: [{ y: 140, color: "hsl(356 72% 50%)" }, { y: 90, color: "hsl(38 90% 52%)" }], secondary: "Diastolic", note: "Dashed lines mark 140 and 90 mmHg" });
  }
  for (const [k, label, domain] of [["weight", "Weight", ["auto", "auto"]], ["glucose", "Blood glucose", ["auto", "auto"]], ["pain", "Pain rating", [0, 10]]] as const) {
    if (!by[k]?.length) continue;
    const { unit, kept, excluded } = oneUnit(by[k].sort(sort));
    out.push({ id: k, label, unit, points: kept.map((r) => pt(r)), excluded, domain: [...domain] as Series["domain"] });
  }
  /* Group by instrument + content version/wording so different question sets are never merged. */
  const snapOf = (r: CareRecord) => (r.metadata?.instrumentSnapshot ?? {}) as { title?: string; contentVersion?: string; version?: string; contentReviewHash?: string; hash?: string; nonValidatedDemo?: boolean; language?: string };
  const verOf = (r: CareRecord) => { const sn = snapOf(r); return String(mStr(r, "instrumentVersion") || sn.version || sn.contentVersion || ""); };
  const hashOf = (r: CareRecord) => { const sn = snapOf(r); return String(mStr(r, "instrumentContentHash") || sn.hash || sn.contentReviewHash || ""); };
  const isPractice = (r: CareRecord) => r.metadata?.nonValidatedDemo === true || snapOf(r).nonValidatedDemo === true || mStr(r, "wording").startsWith("synthetic_practice");
  /* Semantic content key from a complete snapshot; else conservative outer version/hash. */
  const keyOf = (r: CareRecord) => {
    const sem = semanticKey(r);
    if (sem) return `sem:${fnv(sem)}`;
    return ["outer", verOf(r), hashOf(r), isPractice(r) ? "practice" : mStr(r, "wording") || "", snapOf(r).language || mStr(r, "language")].join("~");
  };
  const inst: Record<string, CareRecord[]> = {};
  for (const r of responses) {
    const k = mStr(r, "instrument");
    if (!k || typeof r.value !== "number") continue;
    const g = [k, keyOf(r)].join("|");
    (inst[g] ??= []).push(r);
  }
  const perInst = new Map<string, number>();
  Object.keys(inst).forEach((g) => { const k = g.split("|")[0]; perInst.set(k, (perInst.get(k) ?? 0) + 1); });
  for (const [g, rows] of Object.entries(inst)) {
    const k = g.split("|")[0];
    const practice = rows.some(isPractice);
    const syntheticData = rows.some((r) => r.metadata?.syntheticScore === true);
    const placeholder = rows.some((r) => mStr(r, "wording") === "synthetic_placeholders");
    const snap = snapOf(rows[0]).title;
    const base = k === "phq9" ? "Mood check-in" : k === "gad7" ? "Anxiety check-in" : k === "odi" ? "Function check-in" : k === "pain_nrs" ? "Pain check-in" : snap || rows[0].title;
    const ver = verOf(rows[0]); const h = g.split("|")[1].startsWith("sem:") ? g.split("|")[1].slice(4) : hashOf(rows[0]);
    const tag = (perInst.get(k) ?? 0) > 1 ? (ver ? ` v${ver}` : h ? ` · ${h.slice(0, 6)}` : placeholder ? " · placeholder labels" : practice ? "" : " · unversioned") : "";
    const name = base + tag;
    const { unit, kept, excluded } = oneUnit(rows.sort(sort));
    const notes = [practice ? "Synthetic practice prompts. Not a validated questionnaire score." : placeholder ? "Placeholder item labels; published wording not shown." : "Patient-reported check-in score", syntheticData ? "Synthetic patient data" : ""].filter(Boolean).join(" · ");
    out.push({ id: `resp:${g}`, label: practice ? `${name} (practice score)` : name, unit: unit === "score" ? "" : unit, points: kept.map((r) => pt(r)), excluded, practice, syntheticData, note: notes });
  }
  return out.filter((s) => s.points.length);
}

export function TrendPanel({ p, obs, responses }: { p: Patient; obs: CareRecord[]; responses: CareRecord[] }) {
  const series = useMemo(() => buildSeries(obs, responses), [obs, responses]);
  const [pick, setPick] = useState<string>("");
  const s = series.find((x) => x.id === pick) ?? series[0];
  const monitored = p.programs.some((g) => g === "RPM" || g === "RTM");
  return (
    <Panel
      title={s ? s.label : "Trends"}
      sub={s ? [`${s.points.length} point${s.points.length === 1 ? "" : "s"}`, s.unit, s.note].filter(Boolean).join(" · ") : undefined}
      action={<SimLabel text="Synthetic device feed" />}
    >
      {series.length > 1 && (
        <div className="-mt-1 mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Measurement">
          {series.map((x) => (
            <button key={x.id} role="tab" aria-selected={x.id === s?.id} onClick={() => setPick(x.id)} className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", x.id === s?.id ? "border-foreground bg-foreground text-white" : "border-border bg-card text-muted-foreground hover:text-foreground")} data-testid={`tab-trend-${x.id}`}>
              {x.label}<span className="tnum ml-1 opacity-70">{x.points.length}</span>
            </button>
          ))}
        </div>
      )}
      {!s ? (
        <EmptyState icon={<Gauge className="h-4 w-4" />} title={monitored ? "No readings yet" : "No remote monitoring"} desc={monitored ? "Readings appear here once assigned devices or the patient app send data." : `This patient is enrolled in ${p.programs.join(", ") || "no programs"} without device or therapy monitoring, so there is no measurement trend to chart.`} />
      ) : (
        <>
          {!s.practice && s.syntheticData && <p className="mb-2 rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground" data-testid="note-trend-synthetic">Synthetic patient results for demonstration. The score itself is not a diagnosis.</p>}
          {s.practice && <p className="mb-2 rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground" data-testid="note-trend-practice">Practice scores from synthetic prompts. Not comparable to validated questionnaire results.</p>}
          <div className="h-64" data-testid={`chart-trend-${s.id}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s.points} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid stroke="hsl(40 12% 91%)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(220 4% 42%)" }} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis domain={s.domain ?? ["auto", "auto"]} tick={{ fontSize: 11, fill: "hsl(220 4% 42%)" }} axisLine={false} tickLine={false} allowDecimals />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} labelFormatter={(_, pl) => (pl?.[0]?.payload ? fmtDateTime((pl[0].payload as Point).t) : "")} formatter={(v: number, n: string) => [`${v}${s.unit ? ` ${s.unit}` : ""}`, n]} />
                {s.refs?.map((r) => <ReferenceLine key={r.y} y={r.y} stroke={r.color} strokeDasharray="4 4" />)}
                <Line type="monotone" dataKey="v" name={s.secondary ? "Systolic" : s.label} stroke="hsl(22 88% 42%)" strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />
                {s.secondary && <Line type="monotone" dataKey="v2" name={s.secondary} stroke="hsl(220 5% 12%)" strokeWidth={1.5} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {s.points.length === 1 && <p className="mt-1 text-[11px] text-muted-foreground">Only one reading so far; a trend needs more.</p>}
          {s.excluded > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{s.excluded} reading{s.excluded === 1 ? "" : "s"} not plotted (different unit or marked invalid). See the reading log.</p>}
        </>
      )}
    </Panel>
  );
}
