import { useState } from "react";
import { Check, ClipboardCheck, X } from "lucide-react";
import type { CareRecord } from "@workspace/api-client-react";
import { Btn, Pill, SimLabel, StatusPill } from "@/components/kit";
import { usePermission } from "@/components/access";
import { fmtDateTime, mArr, mNum, mStr } from "@/lib/api";
import { DraftReviewDialog, RejectDraftDialog, draftEffect } from "./draft-review-dialog";

export function DraftCard({ d }: { d: CareRecord }) {
  const { allow } = usePermission();
  const [mode, setMode] = useState<"review" | "reject" | null>(null);
  const provider = mStr(d, "provider") || "deterministic";
  const isLive = !provider.startsWith("deterministic");
  const warnings = mArr(d, "reviewWarnings");
  const ms = mNum(d, "generationMs");
  const effect = draftEffect(d);
  const decided = d.status === "accepted" || d.status === "rejected";
  const finalText = mStr(d, "reviewedText");
  const reviewer = d.status === "accepted" ? mStr(d, "acceptedBy") : mStr(d, "rejectedBy");
  const reviewedAt = d.status === "accepted" ? mStr(d, "acceptedAt") : mStr(d, "rejectedAt");
  const reason = mStr(d, "rejectReason") || mStr(d, "rejectionReason") || (d.status === "rejected" ? mStr(d, "reason") : "");
  return (
    <div className={"mb-3 rounded-lg border p-3 last:mb-0 " + (decided ? "border-border bg-card" : "border-dashed border-primary/30 bg-accent/40")} data-testid={"card-draft-" + d.id}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium">{d.title}</span>
        {isLive ? <Pill tone="indigo">{provider}{mStr(d, "model") ? " · " + mStr(d, "model") : ""}</Pill> : <SimLabel text="Deterministic" />}
        {decided && <StatusPill value={d.status} />}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/80">{d.description}</p>
      {!decided && warnings.length > 0 && (
        <div className="mt-2 rounded-md border border-[hsl(38_80%_78%)] bg-[hsl(38_95%_96%)] p-2 text-[11px] text-[hsl(30_70%_28%)]" data-testid={"warnings-" + d.id}>
          <div className="font-semibold">Review before accepting</div>
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}
      <div className="mt-1.5 text-[10px] text-muted-foreground">
        {[mStr(d, "promptVersion") && "prompt " + mStr(d, "promptVersion"), mArr(d, "sourceIds").length ? mArr(d, "sourceIds").length + " sources" : "", ms !== undefined ? (ms / 1000).toFixed(1) + "s" : ""].filter(Boolean).join(" · ")}
      </div>
      {decided ? (
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground" data-testid={"decision-" + d.id}>
          <div className="flex items-center gap-1.5">{d.status === "accepted" ? <Check className="h-3.5 w-3.5" strokeWidth={1.6} /> : <X className="h-3.5 w-3.5" strokeWidth={1.6} />}{d.status === "accepted" ? "Accepted" : "Rejected"}{reviewer ? " by " + reviewer : ""} · {fmtDateTime(reviewedAt || d.updatedAt)}. Final decision; cannot be re-reviewed.</div>
          {reason && <div>Reason: {reason}</div>}
          {finalText && finalText !== d.description && <details><summary className="cursor-pointer">Reviewed text differs from the generated draft</summary><p className="mt-1 whitespace-pre-wrap text-foreground/80">{finalText}</p></details>}
        </div>
      ) : allow("clinical.write") ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Btn size="sm" variant="primary" onClick={() => setMode("review")} data-testid={"button-accept-draft-" + d.id}><ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.6} />{effect.label}</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setMode("reject")} data-testid={"button-reject-draft-" + d.id}><X className="h-3.5 w-3.5" strokeWidth={1.6} />Reject</Btn>
        </div>
      ) : null}
      {mode === "review" && <DraftReviewDialog d={d} onClose={() => setMode(null)} />}
      {mode === "reject" && <RejectDraftDialog d={d} onClose={() => setMode(null)} />}
    </div>
  );
}
