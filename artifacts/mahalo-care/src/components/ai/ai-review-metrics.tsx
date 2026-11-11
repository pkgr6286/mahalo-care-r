import { Sparkles } from "lucide-react";
import { useGetAiReviewMetrics, getGetAiReviewMetricsQueryKey } from "@workspace/api-client-react";
import { ErrorState, Panel, SkeletonRows } from "@/components/kit";
import { fmtDate } from "@/lib/api";

const pct = (v: number | null) => (v == null ? "Not measured" : (v * 100).toFixed(1) + "%");

export function AiReviewMetricsPanel() {
  const q = useGetAiReviewMetrics({ query: { queryKey: getGetAiReviewMetricsQueryKey() } });
  const m = q.data;
  return (
    <Panel className="lg:col-span-2" title={<span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={1.6} />AI draft review</span>} sub={m ? "Drafts created since " + fmtDate(m.since) + " · " + m.scope : "Drafts created in the last 30 days"}>
      {q.isLoading ? <SkeletonRows rows={3} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : m ? (
        <div className="space-y-4" data-testid="panel-ai-metrics">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Stat k="Drafts" v={m.total} d={m.pending + " pending · " + m.accepted + " accepted · " + m.rejected + " rejected"} />
            <Stat k="Acceptance rate" v={pct(m.acceptanceRate)} d="Accepted ÷ (accepted + rejected)" />
            <Stat k="Edited before accepting" v={m.acceptedWithEditMetrics ? m.editedAccepted + " of " + m.acceptedWithEditMetrics : "Not measured"} d={"Mean edit ratio " + (m.meanEditRatio == null ? "not measured" : m.meanEditRatio.toFixed(3)) + ". Older acceptances have no edit data."} />
            <Stat k="Numeric match rate" v={pct(m.supportedClaimRate)} d={m.supportedClaims + " of " + m.recognizedClaims + " recognized quantities matched frozen source values. Not accuracy."} />
            <Stat k="Drafts source-checked" v={m.sourceCheckedDrafts} d={m.unsupportedDrafts + " with unmatched quantities"} />
            <Stat k="Human numeric exceptions" v={m.humanNumericExceptions} d="Recorded reviewer attestations, not machine-validated" />
            <Stat k="Tokens reported" v={m.totalTokens.toLocaleString()} d={m.tokenReportingDrafts + " drafts reported usage"} />
            <Stat k="Median generation" v={m.medianGenerationMs == null ? "Not measured" : (m.medianGenerationMs / 1000).toFixed(1) + "s"} />
          </dl>
          {m.capabilities.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-left text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground"><tr><th className="px-3 py-2">Capability</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Pending</th><th className="px-3 py-2 text-right">Accepted</th><th className="px-3 py-2 text-right">Rejected</th></tr></thead>
                <tbody>{m.capabilities.map((c) => <tr key={c.capability} className="border-t border-border"><td className="px-3 py-1.5">{c.capability.replace(/_/g, " ")}</td><td className="tnum px-3 py-1.5 text-right">{c.total}</td><td className="tnum px-3 py-1.5 text-right">{c.pending}</td><td className="tnum px-3 py-1.5 text-right">{c.accepted}</td><td className="tnum px-3 py-1.5 text-right">{c.rejected}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer">Definitions and limitations</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>"Not measured" means no data, not zero.</li>
              <li>Numeric match rate covers only recognized number formats compared with frozen source values. It is not clinical accuracy, fidelity or safety.</li>
              <li>No cost estimate is derived from tokens.</li>
              {m.limitations.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </details>
        </div>
      ) : null}
    </Panel>
  );
}

function Stat({ k, v, d }: { k: string; v: string | number; d?: string }) {
  return <div className="min-w-0"><dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{k}</dt><dd className="tnum mt-0.5 font-serif text-xl">{v}</dd>{d && <p className="text-[11px] leading-snug text-muted-foreground">{d}</p>}</div>;
}
