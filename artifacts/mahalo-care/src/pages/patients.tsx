import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, UserRound } from "lucide-react";
import { useCreatePatient, useListPatients, useListRecords, getListRecordsQueryKey, type PatientInput } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, EmptyState, ErrorState, Field, PageHeader, Pill, ProgramTag, SkeletonRows, inputCls, toneFor } from "@/components/kit";
import { PagedList } from "@/components/list-tools";
import { errMsg, fmtRel, initials, PROGRAMS } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {usePermission} from "@/components/access";

export default function PatientsPage() {
  const {allow}=usePermission();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [program, setProgram] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const params = { ...(debounced ? { search: debounced } : {}), ...(program ? { program } : {}), ...(status ? { status } : {}) };
  const list = useListPatients(Object.keys(params).length ? params : undefined);

  return (
    <div>
      <PageHeader
        eyebrow="Patients"
        title="Panel"
        desc="Your accessible patients. Risk, contact and time evidence in one row."
        actions={allow("patients.write")?<Btn variant="primary" onClick={() => setOpen(true)} data-testid="button-new-patient"><Plus className="h-4 w-4" />Add patient</Btn>:undefined}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input className={`${inputCls} pl-9`} placeholder="Search name, MRN, condition" value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-search-patients" />
        </div>
        <select className={`${inputCls} sm:w-40`} value={program} onChange={(e) => setProgram(e.target.value)} data-testid="select-program">
          <option value="">All programs</option>
          {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={`${inputCls} sm:w-40`} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-status">
          <option value="">Any status</option>
          {["active", "inactive"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {list.isLoading ? <SkeletonRows rows={8} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data?.length ? (
        <EmptyState icon={<UserRound className="h-4 w-4" />} title="No patients match" desc="Try a different search, or add a synthetic patient." action={<Btn variant="primary" onClick={() => setOpen(true)}>Add patient</Btn>} />
      ) : (
        <div className="rise overflow-hidden rounded-xl border border-card-border bg-card">
          <div className="hidden grid-cols-[2fr_1.1fr_1fr_0.7fr_0.8fr_0.9fr_0.9fr] gap-3 border-b border-border bg-muted/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
            <span>Patient</span><span>Programs</span><span>Location</span><span>Risk</span><span className="text-right">Minutes</span><span className="text-right">Adherence</span><span className="text-right">Last contact</span>
          </div>
          <PagedList items={list.data} pageSize={25} noun="patients" testid="pager-patients" render={(p) => (
            <Link key={p.id} href={`/patients/${p.id}`} className="grid grid-cols-1 gap-2 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/40 lg:grid-cols-[2fr_1.1fr_1fr_0.7fr_0.8fr_0.9fr_0.9fr] lg:items-center lg:gap-3" data-testid={`row-patient-${p.id}`}>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground">{initials(`${p.firstName} ${p.lastName}`)}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.lastName}, {p.firstName}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.conditions?.length ? p.conditions.slice(0, 2).join(", ") : "No conditions recorded"}{(p.conditions?.length ?? 0) > 2 ? ` +${(p.conditions?.length ?? 0) - 2}` : ""}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">{p.programs.length ? p.programs.map((g) => <ProgramTag key={g} p={g} />) : <span className="text-xs text-muted-foreground">Not enrolled</span>}</div>
              <div className="text-xs text-muted-foreground">{p.location}</div>
              <div><Pill tone={toneFor(p.risk)} dot>{p.risk}</Pill></div>
              <div className="tnum text-right text-sm lg:block hidden">{p.minutes}</div>
              <div className="hidden items-center justify-end gap-2 lg:flex">
                <div className="h-1 w-12 overflow-hidden rounded-full bg-muted"><div className={cn("h-full", p.adherence < 60 ? "bg-destructive" : p.adherence < 80 ? "bg-[hsl(38_90%_52%)]" : "bg-primary")} style={{ width: `${Math.min(100, p.adherence)}%` }} /></div>
                <span className="tnum w-9 text-right text-xs">{p.adherence}%</span>
              </div>
              <div className="hidden text-right text-xs text-muted-foreground lg:block">{p.lastContact ? fmtRel(p.lastContact) : "No contact recorded"}</div>
            </Link>
          )} />
        </div>
      )}
      {allow("patients.write")&&<NewPatientDialog open={open} onOpenChange={setOpen} />}
    </div>
  );
}

function NewPatientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreatePatient();
  const locations = useListRecords("locations", { query: { enabled: open, queryKey: getListRecordsQueryKey("locations") } });
  const staff = useListRecords("staff", { query: { enabled: open, queryKey: getListRecordsQueryKey("staff") } });
  const empty = { firstName: "", lastName: "", dob: "", sex: "F", email: "", phone: "", location: "", timezone: "Pacific/Honolulu", payer: "", careManager: "", conditions: "", medications: "" };
  const [v, setV] = useState(empty);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: PatientInput = {
      firstName: v.firstName.trim(), lastName: v.lastName.trim(), dob: v.dob, sex: v.sex, email: v.email || undefined, phone: v.phone || undefined,
      location: v.location, timezone: v.timezone, payer: v.payer || undefined, careManager: v.careManager || undefined, status: "active",
      conditions: v.conditions.split(",").map((s) => s.trim()).filter(Boolean),
      medications: v.medications.split(",").map((s) => s.trim()).filter(Boolean),
    };
    create.mutate({ data }, {
      onSuccess: (p) => {
        qc.invalidateQueries();
        toast({ title: "Patient added", description: `${p.firstName} ${p.lastName} · ${p.mrn}` });
        onOpenChange(false);
        setV(empty);
        setLocation(`/patients/${p.id}`);
      },
      onError: (err) => toast({ title: "Could not add patient", description: errMsg(err), variant: "destructive" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add a synthetic patient</DialogTitle>
            <DialogDescription>Do not enter real patient information. This demo stores synthetic records only.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><input className={inputCls} value={v.firstName} onChange={set("firstName")} required data-testid="input-first-name" /></Field>
            <Field label="Last name"><input className={inputCls} value={v.lastName} onChange={set("lastName")} required data-testid="input-last-name" /></Field>
            <Field label="Date of birth"><input type="date" className={inputCls} value={v.dob} onChange={set("dob")} required data-testid="input-dob" /></Field>
            <Field label="Sex"><select className={inputCls} value={v.sex} onChange={set("sex")} data-testid="select-sex"><option value="F">Female</option><option value="M">Male</option><option value="X">Other</option></select></Field>
            <Field label="Email"><input type="email" className={inputCls} value={v.email} onChange={set("email")} data-testid="input-patient-email" /></Field>
            <Field label="Phone"><input className={inputCls} value={v.phone} onChange={set("phone")} data-testid="input-phone" /></Field>
            <Field label="Location">
              <select className={inputCls} value={v.location} onChange={set("location")} required data-testid="select-location">
                <option value="">Select site</option>
                {(locations.data ?? []).map((l) => <option key={l.id} value={l.title}>{l.title}</option>)}
              </select>
            </Field>
            <Field label="Care manager">
              <select className={inputCls} value={v.careManager} onChange={set("careManager")} data-testid="select-care-manager">
                <option value="">Unassigned</option>
                {(staff.data ?? []).map((s) => <option key={s.id} value={s.title}>{s.title}</option>)}
              </select>
            </Field>
            <Field label="Payer"><input className={inputCls} value={v.payer} onChange={set("payer")} placeholder="Medicare Part B" data-testid="input-payer" /></Field>
            <Field label="Timezone"><input className={inputCls} value={v.timezone} onChange={set("timezone")} data-testid="input-timezone" /></Field>
          </div>
          <Field label="Conditions" hint="Comma separated"><input className={inputCls} value={v.conditions} onChange={set("conditions")} placeholder="Hypertension, Type 2 diabetes" data-testid="input-conditions" /></Field>
          <Field label="Medications" hint="Comma separated"><input className={inputCls} value={v.medications} onChange={set("medications")} placeholder="Lisinopril 10 mg" data-testid="input-medications" /></Field>
          <DialogFooter>
            <Btn type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn>
            <Btn type="submit" variant="primary" disabled={create.isPending} data-testid="button-create-patient">{create.isPending ? "Adding…" : "Add patient"}</Btn>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
