import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useListRecords, type CareRecord } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, EmptyState, ErrorState, Field, Pill, SkeletonRows, inputCls } from "@/components/kit";
import { mArr, mStr, toInput, useSaveRecord } from "@/lib/api";
import { ConflictNotice } from "@/components/draft-lifecycle";
import { isConflict } from "@/lib/record-lifecycle";
import { cn } from "@/lib/utils";
import { QuestionnaireBuilder, readRange, scoringSummary } from "@/components/admin/questionnaire-builder";
import { QuestionnairePreview, readAnswerLabels, readInstructions } from "@/components/questionnaire-content";

const BUILTIN_RANGE: Record<string, { min: number; max: number }> = { phq9: { min: 0, max: 3 }, gad7: { min: 0, max: 3 }, pain_nrs: { min: 0, max: 10 }, odi: { min: 0, max: 5 }, pgic: { min: 1, max: 7 } };

export const INSTRUMENT_COUNTS: Record<string, number> = { phq9: 9, gad7: 7, pain_nrs: 1, odi: 10, pgic: 1 };

export function instrumentGate(i: CareRecord) {
  const qs = mArr(i, "questions");
  if (!qs.length) return { custom: false, ok: true, missing: [] as string[] };
  const missing: string[] = [];
  const n = readRange(i) ? undefined : INSTRUMENT_COUNTS[mStr(i, "key")];
  if (n !== undefined && qs.length !== n) missing.push("wording has " + qs.length + " items; " + n + " expected");
  if (i.metadata?.contentApprovedForUse !== true) missing.push("local content review attestation");
  if (!mStr(i, "sourceRef").trim()) missing.push("source reference");
  if (mStr(i, "licenseNote").trim().length < 20) missing.push("license / permission note (20+ characters)");
  return { custom: true, ok: !missing.length, missing };
}

export function InstrumentReviewPanel() {
  const q = useListRecords("instruments");
  const [edit, setEdit] = useState<CareRecord | null>(null);
  const [creating, setCreating] = useState(false);
  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
      <p className="max-w-3xl text-xs text-muted-foreground">Custom question wording is used in patient check-ins only after a local reviewer attests it was reviewed and that the practice has permission to use it. This is a human attestation recorded here; the system does not verify licensing.</p>
      <Btn variant="primary" size="sm" onClick={() => setCreating(true)} data-testid="button-new-questionnaire"><Plus className="h-3.5 w-3.5" />New questionnaire</Btn>
      </div>
      {!q.data?.length ? <EmptyState title="No instruments configured" /> : (
        <div className="rise overflow-hidden rounded-xl border border-card-border bg-card">
          {q.data.map((r) => {
            const g = instrumentGate(r);
            return (
              <div key={r.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0" data-testid={"row-instrument-" + r.id}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{r.title}<span className="font-mono text-[11px] text-muted-foreground">{mStr(r, "key")}</span>
                    {r.metadata?.nonValidatedDemo === true ? <Pill tone="amber">Synthetic practice prompts · not validated</Pill> : readRange(r) && !INSTRUMENT_COUNTS[mStr(r, "key")] ? (g.ok ? <Pill tone="green">Custom · approved for use</Pill> : <Pill tone="amber">Custom draft · awaiting review</Pill>) : !g.custom ? <Pill>Synthetic labels</Pill> : g.ok ? <Pill tone="green">Custom wording in use</Pill> : <Pill tone="amber">Custom wording blocked</Pill>}
                    {mStr(r, "sourceType") === "published_source" ? <Pill>Published source wording{mStr(r, "language") ? " · " + mStr(r, "language").toUpperCase() : ""}</Pill> : r.metadata?.nonValidatedDemo !== true && g.custom && g.ok ? <Pill>Source-reviewed content</Pill> : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{g.custom && !g.ok ? "Missing: " + g.missing.join(", ") : [readRange(r) && `${mArr(r, "questions").length} questions, answers ${readRange(r)!.min} to ${readRange(r)!.max}`, scoringSummary(r), mStr(r, "contentVersion") && "v" + mStr(r, "contentVersion"), mStr(r, "sourceRef")].filter(Boolean).join(" · ")}</div>
                </div>
                <Btn size="sm" variant="ghost" onClick={() => setEdit(r)} data-testid={"button-edit-instrument-" + r.id}><Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />Review content</Btn>
              </div>
            );
          })}
        </div>
      )}
      {creating && <QuestionnaireBuilder existing={q.data ?? []} onClose={() => setCreating(false)} />}
      {edit && <InstrumentEditor r={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function InstrumentEditor({ r, onClose }: { r: CareRecord; onClose: () => void }) {
  const original = mArr(r, "questions").join("\n");
  const [text, setText] = useState(original);
  const [sourceRef, setSourceRef] = useState(mStr(r, "sourceRef"));
  const [licenseNote, setLicenseNote] = useState(mStr(r, "licenseNote"));
  const [version, setVersion] = useState(mStr(r, "contentVersion"));
  const [attest, setAttest] = useState(false);
  const [conflict, setConflict] = useState(false);
  const { save, pending } = useSaveRecord();
  const key = mStr(r, "key");
  const custom = !!readRange(r);
  const expected = custom ? undefined : INSTRUMENT_COUNTS[key];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const countOk = custom ? lines.length > 0 : !lines.length || expected === undefined || lines.length === expected;
  const wasApproved = r.metadata?.contentApprovedForUse === true;
  const contentChanged = text !== original || sourceRef !== mStr(r, "sourceRef") || licenseNote !== mStr(r, "licenseNote") || version !== mStr(r, "contentVersion");
  const keepApproval = wasApproved && !contentChanged;
  const approveOk = !!lines.length && countOk && !!sourceRef.trim() && licenseNote.trim().length >= 20 && !!version.trim();
  const approved = keepApproval || (attest && approveOk);
  const valid = countOk && (!attest || approveOk);
  const submit = () => {
    setConflict(false);
    save("instruments", toInput(r, { metadata: { ...(r.metadata ?? {}), questions: lines, sourceRef: sourceRef.trim(), licenseNote: licenseNote.trim(), contentVersion: version.trim(), contentApprovedForUse: approved }, ...(custom ? { status: approved ? "active" : "draft" } : {}) }), r.id, onClose, { expectedUpdatedAt: r.updatedAt, onError: (e) => setConflict(isConflict(e)) });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review content · {r.title}</DialogTitle>
          <DialogDescription>{custom ? "Custom questionnaire. Scoring and answer range were set when it was created." : "Leave questions empty to use the built-in synthetic item labels."} Any change to wording, source, note or version clears the previous approval until it is attested again.</DialogDescription>
        </DialogHeader>
        <Field label={"Questions, one per line" + (expected !== undefined ? " (" + expected + " required for " + key + ")" : "")} hint={lines.length + " lines" + (countOk ? "" : " · wrong count")}>
          <textarea className={cn(inputCls, "h-48 resize-y py-2 text-sm", !countOk && "border-destructive")} value={text} onChange={(e) => { setText(e.target.value); setAttest(false); }} data-testid="input-instrument-questions" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <Field label="Source reference"><input className={inputCls} value={sourceRef} onChange={(e) => { setSourceRef(e.target.value); setAttest(false); }} data-testid="input-instrument-source" /></Field>
          <Field label="Content version"><input className={inputCls} value={version} onChange={(e) => { setVersion(e.target.value); setAttest(false); }} data-testid="input-instrument-version" /></Field>
        </div>
        <Field label="License / permission note" hint={licenseNote.trim().length + " / 20 characters minimum"}>
          <textarea className={cn(inputCls, "h-20 resize-y py-2")} value={licenseNote} onChange={(e) => { setLicenseNote(e.target.value); setAttest(false); }} data-testid="input-instrument-license" />
        </Field>
        {(() => { const rg = readRange(r) ?? BUILTIN_RANGE[key]; if (!rg) return null; const practice = r.metadata?.nonValidatedDemo === true; return (<>
          <QuestionnairePreview expanded title={r.title} instructions={readInstructions(r)} questions={lines} min={rg.min} max={rg.max} labels={readAnswerLabels(r, rg.max - rg.min + 1)} />
          <p className="text-[11px] text-muted-foreground">{practice ? "Synthetic practice prompts. Not a validated questionnaire; scores are not clinical results." : mStr(r, "sourceType") === "published_source" ? "Published source wording. That reflects the source text only; this app has not clinically validated its use." : "Source-reviewed content as recorded by your reviewer. Not clinically validated by this app."}</p>
        </>); })()}
        {keepApproval ? <p className="text-xs text-muted-foreground">Currently approved for use. Saving without content changes keeps that approval.</p> : lines.length > 0 && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={attest} disabled={!approveOk} onChange={(e) => setAttest(e.target.checked)} data-testid="check-instrument-attest" />
            <span>I reviewed this wording, and our practice has documented permission to use it as described in the note. {!approveOk && <span className="text-muted-foreground">(Complete count, source, version and note first.)</span>}</span>
          </label>
        )}
        {lines.length > 0 && !approved && <p className="text-xs text-[hsl(30_80%_30%)]">Saved as not approved: check-ins with this instrument stay blocked for patients.</p>}
        {conflict && <ConflictNotice />}
        <DialogFooter>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={!valid || pending} onClick={submit} data-testid="button-save-instrument">{pending ? "Saving…" : approved && !keepApproval ? "Save and approve for use" : "Save"}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
