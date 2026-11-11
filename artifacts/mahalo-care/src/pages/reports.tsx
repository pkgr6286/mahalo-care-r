import { useState } from "react";
import { Download, Eye } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useExportData, useGetReports, getExportDataQueryKey } from "@workspace/api-client-react";
import { Btn, ErrorState, PageHeader, Panel, SimLabel, SkeletonRows, StatusPill } from "@/components/kit";
import { AdvancedDetails, PagedList } from "@/components/list-tools";
import { fmtRel, mStr } from "@/lib/api";
import { PermissionOnly } from "@/components/access";
import { AiReviewMetricsPanel } from "@/components/ai/ai-review-metrics";
import { GovernanceReports, useGovernanceRole } from "@/components/security-reports";

type ExportKind = "billing" | "patients" | "audit" | "configuration";
const axis = { fontSize: 11, fill: "hsl(220 4% 42%)" };

export default function ReportsPage() {
  const r = useGetReports();
  const gov = useGovernanceRole();
  const [preview, setPreview] = useState<ExportKind | null>(null);
  const exp = useExportData(preview ?? "patients", undefined, { query: { enabled: !!preview, queryKey: getExportDataQueryKey(preview ?? "patients") } });

  return (
    <div>
      <PageHeader eyebrow="Reports" title="Practice performance" desc="Enrollment, risk, staff time and site activity across the practice." />
      {r.isLoading ? <SkeletonRows rows={6} /> : r.isError ? <ErrorState error={r.error} onRetry={() => r.refetch()} /> : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Enrolled and at risk by program">
            <div className="h-60"><ResponsiveContainer><BarChart data={r.data!.programStats} margin={{ left: -18 }}>
              <CartesianGrid stroke="hsl(40 12% 91%)" vertical={false} /><XAxis dataKey="key" tick={axis} axisLine={false} tickLine={false} /><YAxis tick={axis} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="enrolled" fill="hsl(22 88% 42%)" radius={[3, 3, 0, 0]} /><Bar dataKey="atRisk" name="at risk" fill="hsl(356 72% 55%)" radius={[3, 3, 0, 0]} />
            </BarChart></ResponsiveContainer></div>
          </Panel>
          <Panel title="Trend">
            <div className="h-60"><ResponsiveContainer><LineChart data={r.data!.trend} margin={{ left: -18 }}>
              <CartesianGrid stroke="hsl(40 12% 91%)" vertical={false} /><XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} /><YAxis tick={axis} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="readings" stroke="hsl(22 88% 42%)" strokeWidth={2} dot={false} /><Line dataKey="completed" stroke="hsl(220 5% 12%)" dot={false} /><Line dataKey="enrolled" stroke="hsl(189 74% 34%)" dot={false} />
            </LineChart></ResponsiveContainer></div>
          </Panel>
          <Panel title="Staff time" bodyClass="p-0">
            <PagedList items={r.data!.staffTime} pageSize={10} noun="staff" testid="pager-staff" render={(s) => (
              <div key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0">
                <span className="flex-1">{s.title}</span><span className="text-xs text-muted-foreground">{s.description}</span><span className="tnum w-20 text-right font-mono">{s.value ?? 0} {s.unit ?? "min"}</span>
              </div>
            )} />
          </Panel>
          <Panel title="Sites" bodyClass="p-0">
            <PagedList items={r.data!.locations} pageSize={10} noun="sites" testid="pager-sites" render={(s) => (
              <div key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0">
                <span className="flex-1">{s.title}</span><span className="text-xs text-muted-foreground">{s.description}</span><span className="tnum w-20 text-right font-mono">{s.value ?? 0}</span>
              </div>
            )} />
          </Panel>
          <Panel title="Exports" sub="Spreadsheet downloads; preview shows the first rows">
            <div className="space-y-2">
              {(["patients", "billing", "audit", "configuration"] as ExportKind[]).map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="flex-1 text-sm capitalize">{k}</span>
                  <Btn size="sm" variant="ghost" onClick={() => setPreview(preview === k ? null : k)} data-testid={`button-preview-${k}`}><Eye className="h-3.5 w-3.5" />Preview</Btn>
                  <a href={`/api/exports/${k}`} className="inline-flex h-7 items-center gap-1 rounded-md border border-input px-2.5 text-xs font-medium hover:bg-muted" data-testid={`link-export-${k}`}><Download className="h-3.5 w-3.5" />CSV</a>
                  {k !== "configuration" && <a href={`/api/exports/${k}?format=xlsx`} className="inline-flex h-7 items-center gap-1 rounded-md border border-input px-2.5 text-xs font-medium hover:bg-muted" data-testid={`link-export-${k}-xlsx`}><Download className="h-3.5 w-3.5" />XLSX</a>}
                </div>
              ))}
            </div>
            {preview && (
              <div className="mt-3">
                {exp.isLoading ? <div className="h-32 animate-pulse rounded bg-muted" /> : exp.isError ? <ErrorState error={exp.error} onRetry={() => exp.refetch()} /> : (
                  <CsvPreview data={exp.data} />
                )}
              </div>
            )}
          </Panel>
        </div>
      )}
      {r.data && (
        <AdvancedDetails label="Integration and AI diagnostics" className="mt-5" testid="details-report-diagnostics">
          <p className="mb-3 text-muted-foreground">EHR, video and outbound delivery use simulated adapters. Optional live AI drafts still require clinical review.</p>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Integration health" action={<SimLabel text="EHR / delivery simulated" />} bodyClass="p-0">
            {r.data!.integrationHealth.map((s) => (
                <div key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0">
                  <span className="flex-1">{s.title}</span><span className="text-xs text-muted-foreground">{mStr(s, "lastTestedAt") ? `tested ${fmtRel(mStr(s, "lastTestedAt"))}` : ""}</span><StatusPill value={s.status} />
                </div>
            ))}
            </Panel>
            <PermissionOnly any={["clinical.read"]}><AiReviewMetricsPanel /></PermissionOnly>
          </div>
        </AdvancedDetails>
      )}
      {gov.role === "clinical_admin" && <div className="mt-8"><GovernanceReports mode="clinical" /></div>}
    </div>
  );
}

function CsvPreview({ data }: { data: unknown }) {
  if (typeof data !== "string") return <p className="text-xs text-muted-foreground" data-testid="text-export-preview">Preview is available for CSV exports. Use the download buttons for this file.</p>;
  const lines = data.split(/\r?\n/).filter(Boolean);
  const parse = (l: string) => { const out: string[] = []; let cur = ""; let q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
  if (!lines.length) return <p className="text-xs text-muted-foreground" data-testid="text-export-preview">This export has no rows.</p>;
  const head = parse(lines[0]); const rows = lines.slice(1, 9).map(parse);
  return (
    <div data-testid="text-export-preview">
      <div className="max-h-64 overflow-auto rounded-md border border-border">
        <table className="w-full text-[11.5px]"><thead className="sticky top-0 bg-muted"><tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">{h.replace(/_/g, " ")}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="max-w-[200px] truncate whitespace-nowrap px-2 py-1">{c}</td>)}</tr>)}</tbody></table>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{Math.max(0, lines.length - 1)} rows total; showing {rows.length}.</p>
    </div>
  );
}
