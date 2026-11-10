import { useState } from "react";
import { Download, Eye } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useExportData, useGetReports, getExportDataQueryKey } from "@workspace/api-client-react";
import { Btn, ErrorState, PageHeader, Panel, SimLabel, SkeletonRows, StatusPill } from "@/components/kit";
import { fmtRel, mStr } from "@/lib/api";

type ExportKind = "billing" | "patients" | "audit" | "configuration";
const axis = { fontSize: 11, fill: "hsl(218 18% 44%)" };

export default function ReportsPage() {
  const r = useGetReports();
  const [preview, setPreview] = useState<ExportKind | null>(null);
  const exp = useExportData(preview ?? "patients", { query: { enabled: !!preview, queryKey: getExportDataQueryKey(preview ?? "patients") } });

  return (
    <div>
      <PageHeader eyebrow="Reports" title="Practice performance" desc="Program load, staff time, sites and integration health from the synthetic dataset." />
      {r.isLoading ? <SkeletonRows rows={6} /> : r.isError ? <ErrorState error={r.error} onRetry={() => r.refetch()} /> : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Enrolled and at risk by program">
            <div className="h-60"><ResponsiveContainer><BarChart data={r.data!.programStats} margin={{ left: -18 }}>
              <CartesianGrid stroke="hsl(220 24% 93%)" vertical={false} /><XAxis dataKey="key" tick={axis} axisLine={false} tickLine={false} /><YAxis tick={axis} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="enrolled" fill="hsl(243 79% 56%)" radius={[3, 3, 0, 0]} /><Bar dataKey="atRisk" name="at risk" fill="hsl(356 72% 55%)" radius={[3, 3, 0, 0]} />
            </BarChart></ResponsiveContainer></div>
          </Panel>
          <Panel title="Trend">
            <div className="h-60"><ResponsiveContainer><LineChart data={r.data!.trend} margin={{ left: -18 }}>
              <CartesianGrid stroke="hsl(220 24% 93%)" vertical={false} /><XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} /><YAxis tick={axis} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="readings" stroke="hsl(243 79% 56%)" strokeWidth={2} dot={false} /><Line dataKey="completed" stroke="hsl(216 79% 13%)" dot={false} /><Line dataKey="enrolled" stroke="hsl(172 60% 38%)" dot={false} />
            </LineChart></ResponsiveContainer></div>
          </Panel>
          <Panel title="Staff time" bodyClass="p-0">
            {r.data!.staffTime.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0">
                <span className="flex-1">{s.title}</span><span className="text-xs text-muted-foreground">{s.description}</span><span className="tnum w-20 text-right font-mono">{s.value ?? 0} {s.unit ?? "min"}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Sites" bodyClass="p-0">
            {r.data!.locations.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0">
                <span className="flex-1">{s.title}</span><span className="text-xs text-muted-foreground">{s.description}</span><span className="tnum w-20 text-right font-mono">{s.value ?? 0}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Integration health" action={<SimLabel text="All drivers simulated" />} bodyClass="p-0">
            {r.data!.integrationHealth.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0">
                <span className="flex-1">{s.title}</span><span className="text-xs text-muted-foreground">{mStr(s, "lastTestedAt") ? `tested ${fmtRel(mStr(s, "lastTestedAt"))}` : ""}</span><StatusPill value={s.status} />
              </div>
            ))}
          </Panel>
          <Panel title="Exports" sub="CSV from the synthetic dataset">
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
                  <pre className="max-h-56 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px]" data-testid="text-export-preview">{typeof exp.data === "string" ? exp.data.slice(0, 4000) : JSON.stringify(exp.data, null, 2).slice(0, 4000)}</pre>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
