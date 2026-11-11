import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Download, IdCard, Loader2, Pencil, Pill as PillIcon, Plus, ShieldCheck, Stethoscope, Trash2, Users } from "lucide-react";
import {
  useGetClinicalProfile, useUpdateClinicalProfile, useGetProgramProgress,
  getGetClinicalProfileQueryKey, getGetProgramProgressQueryKey, getGetPatientQueryKey, getExportPatientAccessBundleUrl,
  type ClinicalProfile, type ClinicalProfileInput, type ClinicalCondition, type ClinicalMedication, type ClinicalCoverage, type ClinicalContact, type ClinicalIdentifier, type ProgramProgress,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, EmptyState, ErrorState, Field, Panel, Pill, ProgramTag, SkeletonRows, Tabs, inputCls } from "@/components/kit";
import { usePermission } from "@/components/access";
import { CaregiverAccessPanel } from "@/components/caregiver-access";
import { errMsg, fmtDate, PROGRAM_NAMES } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ============================ Hooks ============================ */
export function useClinicalProfile(patientId: string) {
  return useGetClinicalProfile(patientId, { query: { enabled: !!patientId, queryKey: getGetClinicalProfileQueryKey(patientId) } });
}
export function useProgramProgress(patientId: string) {
  return useGetProgramProgress(patientId, { query: { enabled: !!patientId, queryKey: getGetProgramProgressQueryKey(patientId) } });
}

const label = (s?: string | null) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "");
const day = (v?: string | null) => (v ? fmtDate(v) : "");

/* ============================ Program progress ============================ */
export function ProgressMeter({ label: l, value, target, sub }: { label: string; value: number; target: number; sub?: ReactNode }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const met = target > 0 && value >= target;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{l}</span>
        <span className="tnum text-[13px] font-medium text-foreground">{value}<span className="text-[11px] font-normal text-muted-foreground"> / {target}</span></span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-[width] duration-700", met ? "bg-[hsl(162_55%_38%)]" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
      {sub && <div className="mt-1 text-[10.5px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 text-[11px]", ok ? "text-[hsl(162_55%_30%)]" : "text-muted-foreground")}>{ok ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} /> : <CircleDashed className="h-3.5 w-3.5" strokeWidth={1.75} />}{children}</span>;
}

export function ProgramProgressList({ patientId, compact = false, onEnroll }: { patientId: string; compact?: boolean; onEnroll?: () => void }) {
  const q = useProgramProgress(patientId);
  if (q.isLoading) return <div className="p-4"><SkeletonRows rows={2} /></div>;
  if (q.isError) return <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const items = q.data ?? [];
  if (!items.length) return <div className="p-4"><EmptyState title="No active program enrollment" desc="Progress toward program requirements appears once the patient is enrolled with documented consent." action={onEnroll ? <Btn size="sm" onClick={onEnroll} data-testid="button-progress-enroll">Go to enrollment</Btn> : undefined} /></div>;
  return <>{items.map((p) => <ProgressRow key={p.enrollmentId} p={p} compact={compact} />)}</>;
}

function ProgressRow({ p, compact }: { p: ProgramProgress; compact: boolean }) {
  const device = p.deviceDayTarget > 0;
  const steps = compact ? p.nextSteps.slice(0, 2) : p.nextSteps;
  return (
    <div className="border-b border-border px-4 py-3.5 last:border-b-0" data-testid={`row-progress-${p.program}`}>
      <div className="flex flex-wrap items-center gap-2">
        <ProgramTag p={p.program} />
        <span className="text-sm font-medium">{PROGRAM_NAMES[p.program] ?? p.program}</span>
        {p.policyLabel && <span className="truncate text-[11px] text-muted-foreground" title="Program policy applied to this enrollment">{p.policyLabel}</span>}
      </div>
      <div className={cn("mt-3 grid gap-4", device ? "sm:grid-cols-2" : "sm:grid-cols-1 sm:max-w-xs")}>
        <ProgressMeter label="Care minutes" value={p.minutes} target={p.minuteTarget} sub={p.periodLabel} />
        {device && <ProgressMeter label="Device days" value={p.deviceDays} target={p.deviceDayTarget} sub={<>Monitoring window {day(p.windowStart)} to {day(p.windowEnd)}{p.supplyWindowComplete ? " · complete" : " · in progress"}</>} />}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        <Check ok={p.consent}>Consent on file</Check>
        <Check ok={p.signedPlan}>Signed care plan</Check>
        <Check ok={p.liveInteractions > 0}>{p.liveInteractions} live interaction{p.liveInteractions === 1 ? "" : "s"}</Check>
      </div>
      {steps.length > 0 && (
        <ul className="mt-2.5 space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs text-foreground/85">
          {steps.map((s, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary" />{s}</li>)}
          {compact && p.nextSteps.length > steps.length && <li className="text-muted-foreground">+{p.nextSteps.length - steps.length} more in the Time tab</li>}
        </ul>
      )}
    </div>
  );
}

/* ============================ Clinical export ============================ */
export function ClinicalExportButton({ patientId, name }: { patientId: string; name: string }) {
  const { allow, user: me } = usePermission();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!allow("clinical.read") || me?.emergencyContext) return null;
  const download = async () => {
    setBusy(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}${getExportPatientAccessBundleUrl(patientId)}`, { credentials: "include" });
      if (!res.ok) {
        let msg = `Export failed (${res.status})`;
        try { const j = await res.json(); if (j?.error || j?.message) msg = j.error ?? j.message; } catch { /* non-JSON */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const fname = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? `${name.replace(/\s+/g, "-").toLowerCase()}-record-export.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast({ title: "Record export downloaded", description: "Staff-only internal review package, including drafts and history. Do not hand to the patient as-is." });
    } catch (e) {
      toast({ title: "Could not export record", description: e instanceof Error ? e.message : errMsg(e), variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Btn onClick={download} disabled={busy} title="Staff-only ZIP: structured data, drafts and revision history, plus released supporting PDFs. Not a patient disclosure." data-testid="button-clinical-export">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{busy ? "Preparing" : "Export record"}</Btn>
      <span className="max-w-[15rem] text-right text-[10.5px] leading-tight text-muted-foreground" data-testid="note-export-internal">Staff-only review ZIP with drafts and history. Not a patient disclosure.</span>
    </span>
  );
}

/* ============================ Profile view ============================ */
type Section = "conditions" | "medications" | "coverage" | "contacts" | "identifiers";

export function ClinicalProfileSummary({ patientId, onOpen }: { patientId: string; onOpen?: () => void }) {
  const q = useClinicalProfile(patientId);
  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.isError || !q.data) return <ErrorState error={q.error ?? new Error("Profile unavailable")} onRetry={() => q.refetch()} />;
  const d = q.data;
  const conds = d.conditions.filter((c) => c.clinicalStatus === "active");
  const meds = d.medications.filter((m) => m.status === "active");
  const cov = d.coverage.find((c) => c.status === "active") ?? d.coverage[0];
  const emergency = d.contacts.find((c) => c.emergency);
  return (
    <div className="space-y-4 text-sm">
      <div>
        <SubHead>Active problems <Count n={conds.length} /></SubHead>
        {conds.length ? <div className="flex flex-wrap gap-1.5">{conds.slice(0, 8).map((c, i) => <span key={c.id ?? i} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs"><span className="font-mono text-[10.5px] text-muted-foreground">{c.code}</span>{c.display}</span>)}{conds.length > 8 && <span className="text-xs text-muted-foreground">+{conds.length - 8}</span>}</div> : <None>No active problems recorded</None>}
      </div>
      <div>
        <SubHead>Active medications <Count n={meds.length} /></SubHead>
        {meds.length ? <ul className="space-y-1">{meds.slice(0, 6).map((m, i) => <li key={m.id ?? i} className="flex justify-between gap-2 text-[13px]"><span className="truncate"><span className="font-medium">{m.name}</span> <span className="text-muted-foreground">{m.dose} · {m.frequency}</span></span>{m.reconciledAt && <span className="shrink-0 text-[10.5px] text-muted-foreground">rec. {day(m.reconciledAt)}</span>}</li>)}{meds.length > 6 && <li className="text-xs text-muted-foreground">+{meds.length - 6} more</li>}</ul> : <None>No active medications recorded</None>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><SubHead>Coverage</SubHead>{cov ? <div className="text-[13px]">{cov.payer}<div className="text-[11px] text-muted-foreground">{cov.plan}</div></div> : <None>Not recorded</None>}</div>
        <div><SubHead>Emergency contact</SubHead>{emergency ? <div className="text-[13px]">{emergency.name}<div className="text-[11px] text-muted-foreground">{emergency.relationship}{emergency.phone ? ` · ${emergency.phone}` : ""}</div></div> : <None>None listed</None>}</div>
      </div>
      {onOpen && <button type="button" onClick={onOpen} className="text-xs font-medium text-primary hover:underline" data-testid="link-open-clinical-profile">Open full clinical profile</button>}
    </div>
  );
}
const SubHead = ({ children }: { children: ReactNode }) => <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{children}</div>;
const Count = ({ n }: { n: number }) => <span className="tnum rounded bg-muted px-1 text-[10px] text-foreground/70">{n}</span>;
const None = ({ children }: { children: ReactNode }) => <p className="text-xs text-muted-foreground">{children}</p>;

export function ClinicalProfileTab({ patientId }: { patientId: string }) {
  const q = useClinicalProfile(patientId);
  const { allow } = usePermission();
  const canEdit = allow("clinical.write");
  const [edit, setEdit] = useState<Section | null>(null);
  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.isError || !q.data) return <ErrorState error={q.error ?? new Error("Profile unavailable")} onRetry={() => q.refetch()} />;
  const d = q.data;
  const act = (s: Section) => canEdit ? <Btn size="sm" onClick={() => setEdit(s)} data-testid={`button-edit-${s}`}><Pencil className="h-3.5 w-3.5" />Edit</Btn> : undefined;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Last updated {fmtDate(d.updatedAt, "MMM d, yyyy h:mm a")}</span>
        {!canEdit && <span className="inline-flex items-center gap-1.5" data-testid="hint-profile-readonly"><ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.6} />Read only for your role</span>}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={<span className="flex items-center gap-2"><Stethoscope className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Diagnoses</span>} sub={`${d.conditions.filter((c) => c.clinicalStatus === "active").length} active · ${d.conditions.length} total`} action={act("conditions")} bodyClass="p-0">
          {d.conditions.length ? <Table head={["Diagnosis", "Onset", "Status", "Source"]} rows={sortBy(d.conditions, (c) => (c.clinicalStatus === "active" ? 0 : 1)).map((c, i) => [
            <div key={i}><div className="font-medium">{c.display}</div><div className="font-mono text-[10.5px] text-muted-foreground">{c.codeSystem ? `${c.codeSystem} ` : ""}{c.code}{c.chronic ? " · chronic" : ""}</div></div>,
            day(c.onsetDate) || <span className="text-muted-foreground">Unknown</span>, <Pill tone={c.clinicalStatus === "active" ? "amber" : "neutral"}>{c.clinicalStatus}</Pill>, <span className="text-muted-foreground">{c.source}</span>,
          ])} /> : <div className="p-4"><EmptyState title="No diagnoses recorded" /></div>}
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><PillIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Medications</span>} sub={`${d.medications.filter((m) => m.status === "active").length} active`} action={act("medications")} bodyClass="p-0">
          {d.medications.length ? <Table head={["Medication", "Sig", "Status", "Reconciled"]} rows={sortBy(d.medications, (m) => (m.status === "active" ? 0 : 1)).map((m, i) => [
            <div key={i}><div className="font-medium">{m.name}</div>{m.indication && <div className="text-[11px] text-muted-foreground">for {m.indication}</div>}</div>,
            <span className="text-[13px]">{m.dose} {m.route} {m.frequency}</span>, <Pill tone={m.status === "active" ? "green" : "neutral"}>{label(m.status)}</Pill>,
            m.reconciledAt ? <span className="text-xs">{day(m.reconciledAt)}{m.reconciledBy ? <span className="block text-[10.5px] text-muted-foreground">{m.reconciledBy}</span> : null}</span> : <span className="text-xs text-muted-foreground">Not reconciled</span>,
          ])} /> : <div className="p-4"><EmptyState title="No medications recorded" /></div>}
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Coverage</span>} action={act("coverage")} bodyClass="p-0">
          {d.coverage.length ? <Table head={["Payer and plan", "Member ID", "Effective", "Status"]} rows={d.coverage.map((c, i) => [
            <div key={i}><div className="font-medium">{c.payer}</div><div className="text-[11px] text-muted-foreground">{c.plan}</div></div>, <span className="font-mono text-xs">{c.memberId}</span>,
            <span className="text-xs">{day(c.effectiveFrom)}{c.effectiveTo ? ` to ${day(c.effectiveTo)}` : " onward"}</span>, <Pill tone={c.status === "active" ? "green" : c.status === "pending" ? "amber" : "neutral"}>{c.status}</Pill>,
          ])} /> : <div className="p-4"><EmptyState title="No coverage recorded" /></div>}
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Family and emergency contacts</span>} action={act("contacts")} bodyClass="p-0">
          {d.contacts.length ? d.contacts.map((c, i) => (
            <div key={c.id ?? i} className="border-b border-border px-4 py-3 text-sm last:border-b-0" data-testid={`row-contact-${i}`}>
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.name}</span><span className="text-xs text-muted-foreground">{c.relationship}</span>{c.emergency && <Pill tone="red">Emergency</Pill>}</div>
              <div className="text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}</div>
              <div className="mt-1 text-[11px]">{c.sharingAllowed ? <span className="text-[hsl(162_55%_30%)]">May receive: {(c.sharingScope ?? []).map(label).join(", ") || "no categories selected"}{c.consentRecordedAt ? ` · consent ${day(c.consentRecordedAt)}` : ""}</span> : <span className="text-muted-foreground">No information sharing permitted</span>}</div>
            </div>
          )) : <div className="p-4"><EmptyState title="No contacts listed" /></div>}
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><IdCard className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Identifiers</span>} action={act("identifiers")} className="xl:col-span-2" bodyClass="p-0">
          {d.identifiers.length ? <Table head={["System", "Value", "Source"]} rows={d.identifiers.map((x) => [<span className="text-[13px]">{x.system}</span>, <span className="font-mono text-xs">{x.value}</span>, <span className="text-xs text-muted-foreground">{x.source}</span>])} /> : <div className="p-4"><EmptyState title="No external identifiers" /></div>}
        </Panel>
      </div>
      <CaregiverAccessPanel patientId={patientId} />
      {edit && <ProfileEditor key={edit} profile={d} initial={edit} patientId={patientId} onClose={() => setEdit(null)} />}
    </div>
  );
}

function sortBy<T>(a: T[], f: (x: T) => number) { return [...a].sort((x, y) => f(x) - f(y)); }

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border bg-muted/40 text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">{head.map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-border align-top last:border-b-0">{r.map((c, j) => <td key={j} className="px-4 py-2.5">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/* ============================ Editor ============================ */
type Draft = Pick<ClinicalProfile, Section>;
const blank = {
  conditions: (): ClinicalCondition => ({ code: "", codeSystem: "ICD-10-CM", display: "", onsetDate: null, chronic: true, clinicalStatus: "active", source: "Clinician entered" }),
  medications: (): ClinicalMedication => ({ name: "", dose: "", route: "oral", frequency: "", indication: "", status: "active", startedOn: null, reconciledAt: null, reconciledBy: null }),
  coverage: (): ClinicalCoverage => ({ payer: "", plan: "", memberId: "", effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: null, status: "active", verifiedAt: null }),
  contacts: (): ClinicalContact => ({ name: "", relationship: "", phone: "", email: "", emergency: false, sharingAllowed: false, sharingScope: [], consentRecordedAt: null }),
  identifiers: (): ClinicalIdentifier => ({ system: "", value: "", source: "Clinician entered" }),
};
const TITLES: Record<Section, string> = { conditions: "Diagnoses", medications: "Medications", coverage: "Coverage", contacts: "Contacts", identifiers: "Identifiers" };
type ContactScope = NonNullable<ClinicalContact["sharingScope"]>[number];
const SCOPES = ["readings", "careplans", "tasks", "messages", "appointments", "education"] as unknown as ContactScope[];

function required(s: Section, row: Record<string, unknown>): string[] {
  const req: Record<Section, string[]> = { conditions: ["code", "display", "source"], medications: ["name", "dose", "route", "frequency"], coverage: ["payer", "plan", "memberId", "effectiveFrom"], contacts: ["name", "relationship"], identifiers: ["system", "value", "source"] };
  return req[s].filter((k) => !String(row[k] ?? "").trim());
}

function ProfileEditor({ profile, initial, patientId, onClose }: { profile: ClinicalProfile; initial: Section; patientId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const upd = useUpdateClinicalProfile();
  const origin = useRef<Draft>({ conditions: profile.conditions, medications: profile.medications, coverage: profile.coverage, contacts: profile.contacts, identifiers: profile.identifiers });
  const [draft, setDraft] = useState<Draft>(() => structuredClone(origin.current));
  const [sec, setSec] = useState<Section>(initial);
  const [expected, setExpected] = useState(profile.expectedUpdatedAt ?? profile.updatedAt);
  const [conflict, setConflict] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => { if (!conflict) setExpected(profile.expectedUpdatedAt ?? profile.updatedAt); }, [profile.expectedUpdatedAt, profile.updatedAt, conflict]);

  const changed = useMemo(() => (Object.keys(draft) as Section[]).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(origin.current[k])), [draft]);
  const invalid = useMemo(() => (Object.keys(draft) as Section[]).flatMap((k) => (draft[k] as unknown as Record<string, unknown>[]).map((r, i) => ({ k, i, miss: required(k, r) })).filter((x) => x.miss.length)), [draft]);

  const setRow = <S extends Section>(s: S, i: number, patch: Partial<Draft[S][number]>) => setDraft((d) => ({ ...d, [s]: (d[s] as Draft[S][number][]).map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const addRow = (s: Section) => setDraft((d) => ({ ...d, [s]: [...(d[s] as unknown[]), blank[s]()] }));
  const delRow = (s: Section, i: number) => setDraft((d) => ({ ...d, [s]: (d[s] as unknown[]).filter((_, j) => j !== i) }));

  const save = () => {
    setTried(true);
    if (invalid.length) { setSec(invalid[0].k); return; }
    if (!changed.length) { onClose(); return; }
    const data: ClinicalProfileInput = { expectedUpdatedAt: expected };
    for (const k of changed) (data as unknown as Record<string, unknown>)[k] = draft[k];
    upd.mutate({ id: patientId, data }, {
      onSuccess: (res) => {
        qc.setQueryData(getGetClinicalProfileQueryKey(patientId), res);
        qc.invalidateQueries({ queryKey: getGetProgramProgressQueryKey(patientId) });
        qc.invalidateQueries({ queryKey: getGetPatientQueryKey(patientId) });
        qc.invalidateQueries({ queryKey: ["/api/patients", patientId, "caregivers"] });
        toast({ title: "Clinical profile saved", description: changed.map((k) => TITLES[k]).join(", ") + " updated." });
        onClose();
      },
      onError: (e) => {
        const is409 = !!e && typeof e === "object" && "status" in e && (e as { status: number }).status === 409;
        if (is409) { setConflict(true); qc.invalidateQueries({ queryKey: getGetClinicalProfileQueryKey(patientId) }); }
        toast({ title: is409 ? "Not saved: profile changed elsewhere" : "Could not save profile", description: is409 ? "Someone saved a newer version. Your edits are kept here; review and save again to overwrite with your version." : errMsg(e), variant: "destructive" });
      },
    });
  };
  const useLatest = () => { setExpected(profile.expectedUpdatedAt ?? profile.updatedAt); setConflict(false); };

  const rows = draft[sec] as unknown as Record<string, unknown>[];
  const err = (i: number, k: string) => tried && required(sec, rows[i]).includes(k);
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !upd.isPending) onClose(); }}>
      <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 pb-3 pt-5">
          <DialogTitle>Edit clinical profile</DialogTitle>
          <DialogDescription>Changes are saved together and audited. Only edited sections are sent.</DialogDescription>
          <Tabs className="mt-3" value={sec} onChange={setSec} tabs={(Object.keys(TITLES) as Section[]).map((k) => ({ id: k, label: TITLES[k] + (changed.includes(k) ? " ·" : ""), count: draft[k].length }))} />
        </DialogHeader>
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {conflict && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[hsl(38_80%_75%)] bg-[hsl(38_95%_96%)] px-3 py-2 text-xs text-[hsl(30_70%_25%)]" data-testid="notice-profile-conflict">
              Another update was saved while you were editing. Your changes are still here.
              <Btn size="sm" className="ml-auto" onClick={useLatest} data-testid="button-profile-resolve">Keep my edits and retry</Btn>
            </div>
          )}
          {sec === "contacts" && <p className="rounded-lg border border-[hsl(38_80%_80%)] bg-[hsl(38_95%_96.5%)] px-3 py-2 text-xs text-[hsl(30_70%_26%)]" data-testid="note-contact-grant-revoke">Changing or removing a contact's sharing, consent or email revokes any caregiver portal access they hold. History is kept, and re-enabling sharing later does not restore it: a new grant must be recorded.</p>}
          {!rows.length && <EmptyState title={`No ${TITLES[sec].toLowerCase()} yet`} />}
          {rows.map((_, i) => (
            <div key={i} className="rise relative rounded-xl border border-border bg-card p-3 pr-11" data-testid={`editor-${sec}-${i}`}>
              <button type="button" onClick={() => delRow(sec, i)} className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove row" data-testid={`button-remove-${sec}-${i}`}><Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} /></button>
              <RowFields sec={sec} i={i} draft={draft} setRow={setRow} err={err} />
            </div>
          ))}
          <Btn size="sm" onClick={() => addRow(sec)} data-testid={`button-add-${sec}`}><Plus className="h-3.5 w-3.5" />Add {TITLES[sec].toLowerCase().replace(/s$/, "")}</Btn>
        </div>
        <DialogFooter className="items-center border-t border-border px-6 py-3">
          <span className="mr-auto text-xs text-muted-foreground" data-testid="text-profile-dirty">{tried && invalid.length ? <span className="text-destructive">{invalid.length} row{invalid.length === 1 ? "" : "s"} missing required fields</span> : changed.length ? `Unsaved: ${changed.map((k) => TITLES[k]).join(", ")}` : "No changes"}</span>
          <Btn variant="ghost" onClick={onClose} disabled={upd.isPending}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={upd.isPending || conflict} data-testid="button-save-profile">{upd.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving</> : "Save profile"}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SetRow = <S extends Section>(s: S, i: number, patch: Partial<Draft[S][number]>) => void;
function RowFields({ sec, i, draft, setRow, err }: { sec: Section; i: number; draft: Draft; setRow: SetRow; err: (i: number, k: string) => boolean }) {
  const ic = (k: string) => cn(inputCls, err(i, k) && "border-destructive");
  const dateIn = (v?: string | null) => (v ? v.slice(0, 10) : "");
  const nul = (v: string) => (v ? v : null);
  if (sec === "conditions") {
    const r = draft.conditions[i]; const s = (p: Partial<ClinicalCondition>) => setRow("conditions", i, p);
    return <div className="grid gap-3 sm:grid-cols-6">
      <Field label="Code" className="sm:col-span-1"><input className={ic("code")} value={r.code} maxLength={30} onChange={(e) => s({ code: e.target.value.toUpperCase() })} placeholder="I10" data-testid={`input-condition-code-${i}`} /></Field>
      <Field label="Diagnosis" className="sm:col-span-3"><input className={ic("display")} value={r.display} maxLength={250} onChange={(e) => s({ display: e.target.value })} data-testid={`input-condition-display-${i}`} /></Field>
      <Field label="Code system" className="sm:col-span-2"><input className={inputCls} value={r.codeSystem ?? ""} maxLength={80} onChange={(e) => s({ codeSystem: e.target.value })} /></Field>
      <Field label="Onset" className="sm:col-span-2"><input type="date" className={inputCls} value={dateIn(r.onsetDate)} onChange={(e) => s({ onsetDate: nul(e.target.value) })} /></Field>
      <Field label="Status" className="sm:col-span-1"><select className={inputCls} value={r.clinicalStatus} onChange={(e) => s({ clinicalStatus: e.target.value as ClinicalCondition["clinicalStatus"] })}>{["active", "resolved", "inactive"].map((x) => <option key={x} value={x}>{label(x)}</option>)}</select></Field>
      <Field label="Source" className="sm:col-span-2"><input className={ic("source")} value={r.source} maxLength={250} onChange={(e) => s({ source: e.target.value })} /></Field>
      <label className="flex items-end gap-2 pb-2 text-sm sm:col-span-1"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={r.chronic} onChange={(e) => s({ chronic: e.target.checked })} />Chronic</label>
    </div>;
  }
  if (sec === "medications") {
    const r = draft.medications[i]; const s = (p: Partial<ClinicalMedication>) => setRow("medications", i, p);
    return <div className="grid gap-3 sm:grid-cols-6">
      <Field label="Medication" className="sm:col-span-3"><input className={ic("name")} value={r.name} maxLength={250} onChange={(e) => s({ name: e.target.value })} data-testid={`input-med-name-${i}`} /></Field>
      <Field label="Dose" className="sm:col-span-1"><input className={ic("dose")} value={r.dose} maxLength={150} onChange={(e) => s({ dose: e.target.value })} placeholder="10 mg" /></Field>
      <Field label="Route" className="sm:col-span-1"><input className={ic("route")} value={r.route} maxLength={100} onChange={(e) => s({ route: e.target.value })} /></Field>
      <Field label="Status" className="sm:col-span-1"><select className={inputCls} value={r.status} onChange={(e) => s({ status: e.target.value as ClinicalMedication["status"] })}>{["active", "on_hold", "stopped"].map((x) => <option key={x} value={x}>{label(x)}</option>)}</select></Field>
      <Field label="Frequency" className="sm:col-span-2"><input className={ic("frequency")} value={r.frequency} maxLength={150} onChange={(e) => s({ frequency: e.target.value })} placeholder="once daily" /></Field>
      <Field label="Indication" className="sm:col-span-2"><input className={inputCls} value={r.indication ?? ""} maxLength={250} onChange={(e) => s({ indication: e.target.value })} /></Field>
      <Field label="RxNorm" className="sm:col-span-2"><input className={inputCls} value={r.rxnormCode ?? ""} maxLength={30} onChange={(e) => s({ rxnormCode: nul(e.target.value) })} /></Field>
      <Field label="Started" className="sm:col-span-2"><input type="date" className={inputCls} value={dateIn(r.startedOn)} onChange={(e) => s({ startedOn: nul(e.target.value) })} /></Field>
      <Field label="Reconciled on" className="sm:col-span-2"><input type="date" className={inputCls} value={dateIn(r.reconciledAt)} onChange={(e) => s({ reconciledAt: nul(e.target.value) })} /></Field>
      <div className="flex items-end pb-1 sm:col-span-2"><Btn size="sm" onClick={() => s({ reconciledAt: new Date().toISOString().slice(0, 10) })} data-testid={`button-reconcile-${i}`}>Mark reconciled today</Btn></div>
    </div>;
  }
  if (sec === "coverage") {
    const r = draft.coverage[i]; const s = (p: Partial<ClinicalCoverage>) => setRow("coverage", i, p);
    return <div className="grid gap-3 sm:grid-cols-6">
      <Field label="Payer" className="sm:col-span-3"><input className={ic("payer")} value={r.payer} maxLength={200} onChange={(e) => s({ payer: e.target.value })} /></Field>
      <Field label="Plan" className="sm:col-span-3"><input className={ic("plan")} value={r.plan} maxLength={200} onChange={(e) => s({ plan: e.target.value })} /></Field>
      <Field label="Member ID" className="sm:col-span-2"><input className={ic("memberId")} value={r.memberId} maxLength={100} onChange={(e) => s({ memberId: e.target.value })} /></Field>
      <Field label="Effective from" className="sm:col-span-2"><input type="date" className={ic("effectiveFrom")} value={dateIn(r.effectiveFrom)} onChange={(e) => s({ effectiveFrom: e.target.value })} /></Field>
      <Field label="Effective to" className="sm:col-span-2"><input type="date" className={inputCls} value={dateIn(r.effectiveTo)} onChange={(e) => s({ effectiveTo: nul(e.target.value) })} /></Field>
      <Field label="Status" className="sm:col-span-2"><select className={inputCls} value={r.status} onChange={(e) => s({ status: e.target.value as ClinicalCoverage["status"] })}>{["active", "pending", "inactive"].map((x) => <option key={x} value={x}>{label(x)}</option>)}</select></Field>
      <Field label="Verified on" className="sm:col-span-2"><input type="date" className={inputCls} value={dateIn(r.verifiedAt)} onChange={(e) => s({ verifiedAt: nul(e.target.value) })} /></Field>
    </div>;
  }
  if (sec === "contacts") {
    const r = draft.contacts[i]; const s = (p: Partial<ClinicalContact>) => setRow("contacts", i, p);
    const scope = r.sharingScope ?? [];
    return <div className="grid gap-3 sm:grid-cols-6">
      <Field label="Name" className="sm:col-span-3"><input className={ic("name")} value={r.name} maxLength={200} onChange={(e) => s({ name: e.target.value })} /></Field>
      <Field label="Relationship" className="sm:col-span-3"><input className={ic("relationship")} value={r.relationship} maxLength={100} onChange={(e) => s({ relationship: e.target.value })} /></Field>
      <Field label="Phone" className="sm:col-span-3"><input className={inputCls} value={r.phone ?? ""} maxLength={80} onChange={(e) => s({ phone: e.target.value })} /></Field>
      <Field label="Email" className="sm:col-span-3"><input className={inputCls} value={r.email ?? ""} maxLength={250} onChange={(e) => s({ email: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={r.emergency} onChange={(e) => s({ emergency: e.target.checked })} />Emergency contact</label>
      <label className="flex items-center gap-2 text-sm sm:col-span-4"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={r.sharingAllowed} onChange={(e) => s({ sharingAllowed: e.target.checked, sharingScope: e.target.checked ? scope : [], consentRecordedAt: e.target.checked ? r.consentRecordedAt ?? new Date().toISOString() : null })} data-testid={`checkbox-sharing-${i}`} />Patient permits sharing health information with this person</label>
      {r.sharingAllowed && <div className="flex flex-wrap gap-1.5 sm:col-span-6">
        {SCOPES.map((x) => { const on = scope.includes(x); return <button key={x} type="button" onClick={() => s({ sharingScope: on ? scope.filter((y) => y !== x) : [...scope, x] })} className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground")} aria-pressed={on} data-testid={`toggle-scope-${x}-${i}`}>{label(x)}</button>; })}
      </div>}
    </div>;
  }
  const r = draft.identifiers[i]; const s = (p: Partial<ClinicalIdentifier>) => setRow("identifiers", i, p);
  return <div className="grid gap-3 sm:grid-cols-3">
    <Field label="System"><input className={ic("system")} value={r.system} maxLength={250} onChange={(e) => s({ system: e.target.value })} placeholder="State Medicaid ID" /></Field>
    <Field label="Value"><input className={ic("value")} value={r.value} maxLength={250} onChange={(e) => s({ value: e.target.value })} /></Field>
    <Field label="Source"><input className={ic("source")} value={r.source} maxLength={100} onChange={(e) => s({ source: e.target.value })} /></Field>
  </div>;
}
