import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Stethoscope } from "lucide-react";
import { useRecordConsultantReview, type WorklistItem } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Field, inputCls } from "@/components/kit";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ConsultantReviewButton({ i, eligible }: { i: WorklistItem; eligible: boolean }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [days, setDays] = useState("7");
  const [attest, setAttest] = useState(false);
  const [assessed, setAssessed] = useState(false);
  const already = i.record.metadata?.assessment === true;
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = useRecordConsultantReview();
  const n = Number(days);
  const valid = summary.trim().length >= 20 && Number.isInteger(n) && n >= 1 && n <= 90 && attest;
  const submit = () => m.mutate({ data: { patientId: i.patientId, summary: summary.trim(), nextReviewDays: n, ...(assessed ? { assessmentCompleted: true } : {}) } }, {
    onSuccess: () => { qc.invalidateQueries(); toast({ title: "Consultant review recorded", description: i.patientName + " · next review in " + n + " days" }); setOpen(false); setSummary(""); setAttest(false); setAssessed(false); setDays("7"); },
    onError: (e) => toast({ title: "Review not recorded", description: errMsg(e), variant: "destructive" }),
  });
  return (
    <>
      <Btn size="sm" variant={i.consultantReviewDue ? "primary" : "secondary"} onClick={() => setOpen(true)} data-testid={"button-review-" + i.patientId}><Stethoscope className="h-3.5 w-3.5" strokeWidth={1.6} />Review</Btn>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Psychiatric consultant review · {i.patientName}</DialogTitle>
            <DialogDescription>{eligible ? "A professional attestation that you reviewed this patient's registry data and care plan. It is recorded under your name and audited. It is not AI-generated." : "View only."}</DialogDescription>
          </DialogHeader>
          {!eligible ? (
            <p className="rounded-lg border border-border bg-secondary/50 p-3 text-sm text-muted-foreground" data-testid="text-review-ineligible">Only a psychiatric consultant, billing provider, clinical administrator or administrator with an MD, DO, NP, PA or psychiatric consultant credential can attest a consultant review. You can still view the registry and coordinate care.</p>
          ) : (
            <div className="space-y-3">
              <Field label="Review summary" hint={summary.trim().length + " / 20 characters minimum"}>
                <textarea className={cn(inputCls, "h-32 resize-y py-2")} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={assessed ? "Describe the initial assessment (history, diagnoses, measures used) and your recommendations" : "Scores reviewed, recommendations for the care manager and treating provider"} data-testid="input-review-summary" />
              </Field>
              <Field label="Next review in (days)" hint="7 is a provisional starting value. Choose the cadence that fits this patient (1–90).">
                <input type="number" min={1} max={90} step={1} className={cn(inputCls, "w-28")} value={days} onChange={(e) => setDays(e.target.value)} data-testid="input-review-days" />
              </Field>
              {already ? <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground" data-testid="text-assessment-documented">Initial comprehensive assessment already documented for this enrollment.</p> : (
                <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={assessed} onChange={(e) => setAssessed(e.target.checked)} data-testid="check-review-assessment" /><span>Initial comprehensive assessment completed. <span className="text-muted-foreground">Only check if you completed it; describe the assessment in the summary.</span></span></label>
              )}
              <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={attest} onChange={(e) => setAttest(e.target.checked)} data-testid="check-review-attest" />I personally reviewed this patient's registry information as the psychiatric consultant.</label>
            </div>
          )}
          <DialogFooter>
            <Btn variant="ghost" onClick={() => setOpen(false)}>{eligible ? "Cancel" : "Close"}</Btn>
            {eligible && <Btn variant="primary" disabled={!valid || m.isPending} onClick={submit} data-testid="button-submit-review">{m.isPending ? "Recording…" : "Record review"}</Btn>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
