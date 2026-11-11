import { useState } from "react";
import { LifeBuoy } from "lucide-react";
import type { CareRecord } from "@workspace/api-client-react";
import { mArr, mStr } from "@/lib/api";
import { cn } from "@/lib/utils";

/** metadata.instructions (stem / recall period), trimmed. */
export const readInstructions = (r?: CareRecord) => mStr(r, "instructions").trim();

/** metadata.answerLabels indexed by (answer - range.min). Returns [] unless one label exists per option. */
export function readAnswerLabels(r: CareRecord | undefined, optionCount: number): string[] {
  const raw = mArr(r, "answerLabels").map((x) => String(x ?? "").trim());
  return raw.length === optionCount && raw.every(Boolean) ? raw : [];
}

/** Canonical PHQ-9 source wording (not demo prompts, not a custom questionnaire). */
export const isCanonicalPhq9 = (r?: CareRecord) => !!r && mStr(r, "key") === "phq9" && r.metadata?.nonValidatedDemo !== true && mArr(r, "questions").length === 9;

export function UrgentSupportNotice({ after = false, className }: { after?: boolean; className?: string }) {
  return (
    <div role="alert" className={cn("rounded-xl border border-destructive/35 bg-destructive/5 p-3.5 text-left text-sm", className)} data-testid={after ? "patient-urgent-help" : "patient-urgent-help-pre"}>
      <div className="flex items-center gap-2 font-semibold"><LifeBuoy className="h-4 w-4 text-destructive" strokeWidth={1.7} />If you need help right now, do not wait for the app</div>
      <ul className="mt-2 space-y-1 text-[13px] leading-snug">
        <li>If you are in immediate danger or may hurt yourself, call <strong>911</strong> or go to the nearest emergency room.</li>
        <li>In the US, call or text <strong>988</strong> (Suicide &amp; Crisis Lifeline), any time.</li>
        <li>Contact your care team so they know how you are feeling.</li>
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">{after ? "Your answers were sent, but they" : "Your answers"} are not monitored around the clock. This app is not an emergency service.</p>
    </div>
  );
}

/** Read-only rendering of what a patient will see. Used by reviewers and the builder. */
export function QuestionnairePreview({ title, instructions, questions, min, max, labels, expanded = false }: { title: string; instructions: string; questions: string[]; min: number; max: number; labels: string[]; expanded?: boolean }) {
  const [all, setAll] = useState(expanded);
  const opts = max >= min && max - min <= 20 ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : [];
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3" data-testid="questionnaire-preview">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Patient preview</div>
      <div className="text-sm font-semibold">{title || "Untitled"}</div>
      {instructions ? <p className="mt-1 text-xs">{instructions}</p> : <p className="mt-1 text-[11px] italic text-muted-foreground">No instructions</p>}
      <ol className="mt-2 space-y-1.5" data-testid="preview-questions">
        {(questions.length ? (all ? questions : questions.slice(0, 3)) : ["(no questions yet)"]).map((q, i) => <li key={i} className="text-xs"><span className="tnum mr-1 text-muted-foreground">{i + 1}.</span>{q}</li>)}
      </ol>
      {questions.length > 3 && <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline" aria-expanded={all} data-testid="button-preview-toggle">{all ? "Show first 3 only" : `Show all ${questions.length} questions`}</button>}
      <div className="mt-2 flex flex-wrap gap-1">
        {opts.map((v, i) => <span key={v} className="rounded-md border border-border bg-card px-2 py-1 text-[11px]"><span className="tnum font-medium">{v}</span>{labels[i] ? <span className="ml-1 text-muted-foreground">{labels[i]}</span> : null}</span>)}
      </div>
      {!labels.length && opts.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Numbers only; no answer labels set.</p>}
    </div>
  );
}
