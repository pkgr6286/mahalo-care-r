import { useMemo, useState } from "react";
import { Archive, BookOpen, CheckCircle2, CircleDashed, FilePen, Plus, RotateCcw, ShieldAlert } from "lucide-react";
import { useListRecords, type CareRecord, type RecordInput } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, EmptyState, ErrorState, Field, ProgramTag, SkeletonRows, inputCls } from "@/components/kit";
import { PROGRAMS, fmtDateTime, mStr, toInput, useSaveRecord } from "@/lib/api";
import { ConflictNotice } from "@/components/draft-lifecycle";
import { isConflict } from "@/lib/record-lifecycle";
import { cn } from "@/lib/utils";

/** HTTPS only, no embedded username/password. */
function safeHttps(u: string): string | null {
  try { const x = new URL(u); return x.protocol === "https:" && !x.username && !x.password ? x.href : null; } catch { return null; }
}

type State = "active" | "ready" | "review" | "archived" | "blocked";
type Filter = "all" | "active" | "draft" | "review" | "archived";
const TYPES = [{ v: "reading", l: "Reading" }, { v: "exercise", l: "Exercise" }, { v: "app_instructions", l: "App instructions" }];

const bodyOf = (r: CareRecord) => mStr(r, "body") || mStr(r, "content") || mStr(r, "text");
const isNonClinical = (r: CareRecord) => r.metadata?.nonClinical === true;
const isApproved = (r: CareRecord) => r.metadata?.contentApprovedForUse === true;

type Fields = { body: string; url: string; version: string; sourceRef: string; licenseNote: string; nonClinical: boolean; approved: boolean };
/** Returns the list of unmet activation requirements (empty = may be activated). */
function activationGaps(f: Fields) {
  const gaps: string[] = [];
  const url = f.url.trim() ? safeHttps(f.url.trim()) : null;
  if (!f.body.trim() && !url) gaps.push("text or an HTTPS resource");
  if (f.url.trim() && !url) gaps.push("a valid HTTPS link (or none)");
  if (!f.nonClinical) {
    if (!f.body.trim()) gaps.push("locally stored text (clinical material)");
    if (!f.sourceRef.trim()) gaps.push("source reference");
    if (f.licenseNote.trim().length < 20) gaps.push("license / use note of 20+ characters");
    if (!f.approved) gaps.push("content review attestation");
  }
  return gaps;
}
const fieldsOf = (r: CareRecord): Fields => ({ body: bodyOf(r), url: mStr(r, "url"), version: mStr(r, "contentVersion"), sourceRef: mStr(r, "sourceRef"), licenseNote: mStr(r, "licenseNote"), nonClinical: isNonClinical(r), approved: isApproved(r) });

function stateOf(r: CareRecord): State {
  if (r.status === "inactive") return "archived";
  const ok = !activationGaps(fieldsOf(r)).length;
  if (r.status === "active") return ok ? "active" : "blocked";
  return ok ? "ready" : "review";
}
const STATE: Record<State, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  active: { label: "Active", cls: "bg-[hsl(150_40%_94.5%)] text-[hsl(152_60%_24%)] border-[hsl(150_35%_80%)]", icon: CheckCircle2 },
  blocked: { label: "Active · review required", cls: "bg-[hsl(352_80%_97%)] text-[hsl(352_72%_36%)] border-[hsl(352_65%_86%)]", icon: ShieldAlert },
  ready: { label: "Draft · reviewed", cls: "bg-accent text-accent-foreground border-primary/15", icon: FilePen },
  review: { label: "Draft · review required", cls: "bg-[hsl(38_95%_95%)] text-[hsl(30_80%_34%)] border-[hsl(38_80%_82%)]", icon: CircleDashed },
  archived: { label: "Archived", cls: "bg-muted text-muted-foreground border-border", icon: Archive },
};
function StateBadge({ s }: { s: State }) {
  const c = STATE[s];
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[11px] font-medium leading-5 whitespace-nowrap", c.cls)}><c.icon className="h-3 w-3" strokeWidth={1.6} />{c.label}</span>;
}

export function EducationAuthoring() {
  const q = useListRecords("education");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<CareRecord | "new" | null>(null);
  const [transition, setTransition] = useState<{ r: CareRecord; to: "active" | "inactive" | "draft" } | null>(null);
  const rows = useMemo(() => (q.data ?? []).filter((r) => !r.patientId).map((r) => ({ r, s: stateOf(r) })), [q.data]);
  const counts = { all: rows.length, active: rows.filter((x) => x.s === "active" || x.s === "blocked").length, draft: rows.filter((x) => x.s === "ready").length, review: rows.filter((x) => x.s === "review" || x.s === "blocked").length, archived: rows.filter((x) => x.s === "archived").length };
  const shown = rows.filter(({ s }) => filter === "all" || (filter === "active" && (s === "active" || s === "blocked")) || (filter === "draft" && s === "ready") || (filter === "review" && (s === "review" || s === "blocked")) || (filter === "archived" && s === "archived"));
  const tabs: { id: Filter; l: string }[] = [{ id: "all", l: "All" }, { id: "active", l: "Active" }, { id: "review", l: "Review required" }, { id: "draft", l: "Reviewed drafts" }, { id: "archived", l: "Archived" }];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-[20px] leading-tight">Learning materials</h2>
          <p className="mt-1 text-xs text-muted-foreground">Patients only see active material, and acknowledge the exact version they read. New material starts as a draft. Review attestations are local and recorded with your account; they are not independent medical or legal validation.</p>
        </div>
        <Btn variant="primary" onClick={() => setEditing("new")} data-testid="button-new-education"><Plus className="h-4 w-4" strokeWidth={1.6} />New material</Btn>
      </div>
      <div className="flex flex-wrap gap-1 rounded-full border border-border bg-card p-1 text-xs w-fit" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={filter === t.id} onClick={() => setFilter(t.id)} className={cn("rounded-full px-3 py-1 font-medium transition-colors", filter === t.id ? "bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))]" : "text-muted-foreground hover:text-foreground")} data-testid={"filter-education-" + t.id}>
            {t.l} <span className="tnum opacity-70">{counts[t.id]}</span>
          </button>
        ))}
      </div>
      {q.isLoading ? <SkeletonRows rows={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !shown.length ? (
        <EmptyState icon={<BookOpen className="h-4 w-4" strokeWidth={1.6} />} title={filter === "all" ? "No learning material yet" : "Nothing in this view"} desc={filter === "all" ? "Write or link material, attest its review, then activate it for patients." : undefined} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map(({ r, s }) => (
            <article key={r.id} className={cn("rise flex flex-col rounded-2xl border border-card-border bg-card p-4 shadow-[var(--shadow-sm)]", s === "archived" && "opacity-70")} data-testid={"card-education-" + r.id}>
              <div className="flex flex-wrap items-center gap-2"><StateBadge s={s} /><ProgramTag p={r.program} /><span className="text-[11px] text-muted-foreground">{isNonClinical(r) ? "Non-clinical instructions" : "Clinical"}{mStr(r, "contentVersion") ? " · v" + mStr(r, "contentVersion") : ""}</span></div>
              <h3 className="mt-2 text-[15px] font-medium leading-snug">{r.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description || bodyOf(r) || "No text yet."}</p>
              <div className="mt-3 text-[10.5px] text-muted-foreground">{mStr(r, "contentReviewedBy") ? "Reviewed by " + mStr(r, "contentReviewedBy") + " · " + fmtDateTime(mStr(r, "contentReviewedAt")) : "Not reviewed"}</div>
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                <Btn size="sm" onClick={() => setEditing(r)} data-testid={"button-edit-education-" + r.id}><FilePen className="h-3.5 w-3.5" strokeWidth={1.6} />{s === "archived" ? "View" : "Edit and review"}</Btn>
                {(s === "ready" || s === "review") && <Btn size="sm" variant="primary" disabled={s !== "ready"} title={s !== "ready" ? "Complete review first" : undefined} onClick={() => setTransition({ r, to: "active" })} data-testid={"button-activate-" + r.id}>Activate</Btn>}
                {s === "blocked" && <Btn size="sm" onClick={() => setTransition({ r, to: "draft" })}><RotateCcw className="h-3.5 w-3.5" strokeWidth={1.6} />Return to draft</Btn>}
                {s === "archived" ? <Btn size="sm" variant="ghost" onClick={() => setTransition({ r, to: "draft" })} data-testid={"button-restore-education-" + r.id}><RotateCcw className="h-3.5 w-3.5" strokeWidth={1.6} />Restore as draft</Btn>
                  : <Btn size="sm" variant="ghost" className="ml-auto" onClick={() => setTransition({ r, to: "inactive" })} data-testid={"button-archive-education-" + r.id}><Archive className="h-3.5 w-3.5" strokeWidth={1.6} />Archive</Btn>}
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && <EducationEditor r={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {transition && <TransitionDialog r={transition.r} to={transition.to} onClose={() => setTransition(null)} />}
    </div>
  );
}

function TransitionDialog({ r, to, onClose }: { r: CareRecord; to: "active" | "inactive" | "draft"; onClose: () => void }) {
  const { save, pending } = useSaveRecord();
  const [conflict, setConflict] = useState(false);
  const gaps = to === "active" ? activationGaps(fieldsOf(r)) : [];
  const copy = {
    active: { t: "Activate for patients", d: "Patients enrolled in " + (r.program ?? "any program") + " will see this exact version and can acknowledge it.", b: "Activate" },
    inactive: { t: "Archive material", d: "Patients stop seeing it. Content, past acknowledgments and audit history are kept. Nothing is deleted.", b: "Archive" },
    draft: { t: "Return to draft", d: "Not shown to patients until reviewed and activated again.", b: "Return to draft" },
  }[to];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{copy.t}</DialogTitle><DialogDescription>{copy.d}</DialogDescription></DialogHeader>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"><div className="font-medium">{r.title}</div><div className="text-[11px] text-muted-foreground">{isNonClinical(r) ? "Non-clinical instructions" : "Clinical material"}{mStr(r, "contentVersion") ? " · v" + mStr(r, "contentVersion") : ""}</div></div>
        {gaps.length > 0 && <p role="alert" className="text-xs text-destructive">Missing: {gaps.join(", ")}.</p>}
        {conflict && <ConflictNotice />}
        <DialogFooter>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant={to === "inactive" ? "danger" : "primary"} disabled={pending || gaps.length > 0} onClick={() => { setConflict(false); save("education", toInput(r, { status: to }), r.id, onClose, { expectedUpdatedAt: r.updatedAt, onError: (e) => setConflict(isConflict(e)) }); }} data-testid="button-confirm-education-status">{pending ? "Saving…" : copy.b}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EducationEditor({ r, onClose }: { r: CareRecord | null; onClose: () => void }) {
  const init = r ? fieldsOf(r) : { body: "", url: "", version: "1", sourceRef: "", licenseNote: "", nonClinical: false, approved: false };
  const [title, setTitle] = useState(r?.title ?? "");
  const [description, setDescription] = useState(r?.description ?? "");
  const [program, setProgram] = useState(r?.program ?? "");
  const [type, setType] = useState(mStr(r ?? undefined, "type") || "reading");
  const [f, setF] = useState(init);
  const [attest, setAttest] = useState(false);
  const [conflict, setConflict] = useState(false);
  const { save, pending } = useSaveRecord();
  const readOnly = r?.status === "inactive";
  const reviewedChanged = title.trim() !== (r?.title ?? "").trim() || description !== (r?.description ?? "") || (program || null) !== (r?.program ?? null) || type !== (mStr(r ?? undefined, "type") || "reading") || f.body !== init.body || f.url !== init.url || f.version !== init.version || f.sourceRef !== init.sourceRef || f.licenseNote !== init.licenseNote || f.nonClinical !== init.nonClinical;
  const keepApproval = !!r && init.approved && !reviewedChanged;
  const approved = keepApproval || attest;
  const urlBad = !!f.url.trim() && !safeHttps(f.url.trim());
  const attestReady = !f.nonClinical && !!f.body.trim() && !!f.sourceRef.trim() && f.licenseNote.trim().length >= 20 && !!f.version.trim() && !urlBad;
  const gaps = activationGaps({ ...f, approved });
  const revokes = !!r && init.approved && reviewedChanged && !attest;
  const withdraw = r?.status === "active" && gaps.length > 0;
  const setMeta = <K extends string>(fn: (v: K) => void) => (v: K) => { fn(v); setAttest(false); };
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setAttest(false); };

  const submit = () => {
    setConflict(false);
    const metadata = { ...(r?.metadata ?? {}), type, body: f.body, content: null, text: null, url: f.url.trim() || null, contentVersion: f.version.trim(), sourceRef: f.sourceRef.trim(), licenseNote: f.licenseNote.trim(), nonClinical: f.nonClinical, contentApprovedForUse: f.nonClinical ? false : approved };
    const base: Partial<RecordInput> = { title: title.trim(), description, program: program || null, metadata, ...(withdraw ? { status: "draft" } : {}) };
    if (r) save("education", toInput(r, base), r.id, onClose, { expectedUpdatedAt: r.updatedAt, onError: (e) => setConflict(isConflict(e)) });
    else save("education", { ...base, title: title.trim(), status: "draft", patientId: null }, undefined, onClose);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{r ? (readOnly ? "Archived material" : "Edit material") : "New learning material"}</DialogTitle>
          <DialogDescription>{r ? "Status: " + STATE[stateOf(r)].label + ". Activate or archive from the list. Active material that stops meeting requirements is saved as a draft." : "Saved as a draft. Patients will not see it until it is reviewed and activated."}</DialogDescription>
        </DialogHeader>
        <fieldset disabled={readOnly} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem_10rem]">
            <Field label="Title"><input className={inputCls} value={title} onChange={(e) => setMeta(setTitle)(e.target.value)} maxLength={200} data-testid="input-education-title" /></Field>
            <Field label="Program"><select className={inputCls} value={program} onChange={(e) => setMeta(setProgram)(e.target.value)} data-testid="select-education-program"><option value="">All programs</option>{PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
            <Field label="Type"><select className={inputCls} value={type} onChange={(e) => setMeta(setType)(e.target.value)} data-testid="select-education-type">{TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select></Field>
          </div>
          <Field label="Summary" hint="One or two sentences shown on the patient card."><textarea className={cn(inputCls, "h-16 resize-y py-2")} value={description} onChange={(e) => setMeta(setDescription)(e.target.value)} data-testid="input-education-summary" /></Field>
          <Field label="Material text" hint="Plain text, shown exactly as written. Written or sourced by your team.">
            <textarea className={cn(inputCls, "h-56 resize-y whitespace-pre-wrap py-2 text-sm leading-relaxed")} value={f.body} onChange={set("body")} data-testid="input-education-body" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field label="Resource link (optional)" hint={urlBad ? "Only https:// links without embedded credentials are allowed." : undefined}><input className={cn(inputCls, urlBad && "border-destructive")} value={f.url} onChange={set("url")} placeholder="https://" data-testid="input-education-url" /></Field>
            <Field label="Version"><input className={inputCls} value={f.version} onChange={set("version")} data-testid="input-education-version" /></Field>
          </div>

          <section className="rounded-xl border border-border p-3.5">
            <div className="text-xs font-semibold">Classification</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[{ v: false, t: "Clinical material", d: "Needs stored text, a source, a use note and a review attestation." }, { v: true, t: "Non-clinical app instructions", d: "How to use the app or a device. Not clinically reviewed or validated." }].map((o) => (
                <label key={String(o.v)} className={cn("flex cursor-pointer gap-2 rounded-lg border p-2.5 text-sm transition-colors", f.nonClinical === o.v ? "border-[hsl(var(--brand-charcoal))] bg-secondary/60" : "border-border hover:border-foreground/25")}>
                  <input type="radio" name="edu-class" className="mt-1 accent-[hsl(var(--primary))]" checked={f.nonClinical === o.v} onChange={() => { setF({ ...f, nonClinical: o.v }); setAttest(false); }} />
                  <span><span className="font-medium">{o.t}</span><span className="block text-[11px] text-muted-foreground">{o.d}</span></span>
                </label>
              ))}
            </div>
            {!f.nonClinical && (
              <div className="mt-3 grid gap-3">
                <Field label="Source reference"><input className={inputCls} value={f.sourceRef} onChange={set("sourceRef")} data-testid="input-education-source" /></Field>
                <Field label="License / use note" hint={f.licenseNote.trim().length + " / 20 characters minimum"}><textarea className={cn(inputCls, "h-16 resize-y py-2")} value={f.licenseNote} onChange={set("licenseNote")} data-testid="input-education-license" /></Field>
                {keepApproval ? (
                  <p className="text-xs text-muted-foreground">Review attestation on file{mStr(r ?? undefined, "contentReviewedBy") ? " (" + mStr(r ?? undefined, "contentReviewedBy") + ")" : ""}. Changing any field (title, summary, program, type, text, link, version, source, note or classification) revokes it.</p>
                ) : (
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={attest} disabled={!attestReady} onChange={(e) => setAttest(e.target.checked)} data-testid="check-education-attest" />
                    <span>I reviewed this exact text and version for patient use, and the source and use note are accurate. <span className="text-muted-foreground">{attestReady ? "Recorded with your account. This is a local attestation, not independent validation." : "Complete text, version, source and note first."}</span></span>
                  </label>
                )}
              </div>
            )}
          </section>
          {revokes && !withdraw && <p role="status" className="text-xs text-[hsl(30_80%_30%)]">Saving these changes revokes the current review.</p>}
          {withdraw && <div role="alert" className="rounded-lg border border-[hsl(352_65%_86%)] bg-[hsl(352_80%_97%)] px-3 py-2 text-xs text-[hsl(352_72%_36%)]" data-testid="alert-education-withdraw"><span className="font-semibold">Saving will withdraw this material from patients.</span> It no longer meets activation requirements, so it is saved as a draft with your content kept. Re-attest above to keep it active instead.</div>}
          <p className="text-[11px] text-muted-foreground">{gaps.length ? "Before activation: " + gaps.join(", ") + "." : "Ready to activate after saving."}</p>
        </fieldset>
        {conflict && <ConflictNotice />}
        <DialogFooter>
          <Btn variant="ghost" onClick={onClose}>{readOnly ? "Close" : "Cancel"}</Btn>
          {!readOnly && <Btn variant={withdraw ? "danger" : "primary"} disabled={pending || !title.trim() || urlBad} onClick={submit} data-testid="button-save-education">{pending ? "Saving…" : withdraw ? "Save as draft and withdraw" : r ? "Save changes" : "Save draft"}</Btn>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
