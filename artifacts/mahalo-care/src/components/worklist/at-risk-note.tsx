import { Link } from "wouter";
import { Info } from "lucide-react";
import type { WorklistItem } from "@workspace/api-client-react";
import { fmtDateTime } from "@/lib/api";

/** At-risk rows come from the last stored provisional billing calculation, not a live forecast. */
export function AtRiskNote({ items, billing }: { items?: WorklistItem[]; billing: boolean }) {
  const latest = (items ?? []).map((i) => i.record.updatedAt).filter(Boolean).sort().at(-1);
  return (
    <div className="flex gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground" data-testid="note-at-risk-source">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
      <span>
        Based on the last provisional billing calculation, not live clinical data{latest ? <>; newest source record on this page updated {fmtDateTime(latest)}</> : null}. Rule-engine alerts stay live and independent.{" "}
        {billing ? <>After clinical changes, recalculate in <Link href="/billing" className="font-medium text-primary hover:underline" data-testid="link-at-risk-billing">Billing</Link> to refresh this list.</> : "After clinical changes, ask the billing team to recalculate to refresh this list."}
      </span>
    </div>
  );
}
