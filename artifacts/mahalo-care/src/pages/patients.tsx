import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, Upload, UserRound } from "lucide-react";
import { useCreatePatient, useListPatients, useListRecords, getListRecordsQueryKey, type PatientInput } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, EmptyState, ErrorState, Field, PageHeader, Pill, ProgramTag, SkeletonRows, inputCls, toneFor } from "@/components/kit";
import { PagedList } from "@/components/list-tools";
import { errMsg, fmtRel, initials, PROGRAMS } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {usePermission} from "@/components/access";
import { sortPatients, type PatientSortKey, type SortDirection } from "@/lib/patient-sort";
import { PatientImport } from "@/components/patient-import";

// Zero intrinsic minimums keep long clinical text from moving individual rows' columns.
const patientGrid = "lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,.75fr)_minmax(0,.75fr)_minmax(0,1.1fr)_minmax(0,1.1fr)]";
const columns: { key: PatientSortKey; label: string; right?: boolean }[] = [
  {key:"patient",label:"Patient"},{key:"programs",label:"Programs"},{key:"location",label:"Location"},
  {key:"risk",label:"Risk"},{key:"minutes",label:"Minutes",right:true},{key:"adherence",label:"Adherence",right:true},{key:"lastContact",label:"Last contact",right:true},
];

export default function PatientsPage() {
  const {allow}=usePermission();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [program, setProgram] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [sort, setSort] = useState<{key:PatientSortKey;direction:SortDirection}>({key:"patient",direction:"asc"});
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const params = { ...(debounced ? { search: debounced } : {}), ...(program ? { program } : {}), ...(status ? { status } : {}) };
  const list = useListPatients(Object.keys(params).length ? params : undefined);
  const sorted = useMemo(()=>sortPatients(list.data??[],sort.key,sort.direction),[list.data,sort]);
  const changeSort = (key:PatientSortKey) => setSort(current=>({key,direction:current.key===key?(current.direction==="asc"?"desc":"asc"):["risk","minutes","adherence","lastContact"].includes(key)?"desc":"asc"}));

  return (
    <div>
      <PageHeader
        eyebrow="Patients"
        title="Panel"
        desc="Your accessible patients. Risk, contact and time evidence in one row."
        actions={allow("patients.write")?<div className="flex gap-2">{allow("admin")&&<Btn onClick={()=>setImportOpen(true)} data-testid="button-import-patients"><Upload className="h-4 w-4" />Import patients</Btn>}<Btn variant="primary" onClick={() => setOpen(true)} data-testid="button-new-patient"><Plus className="h-4 w-4" />Add patient</Btn></div>:undefined}
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
      <div className="mb-3 flex items-center gap-2 lg:hidden">
        <label htmlFor="patient-sort" className="shrink-0 text-xs text-muted-foreground">Sort by</label>
        <select id="patient-sort" className={cn(inputCls,"flex-1")} value={sort.key} onChange={e=>changeSort(e.target.value as PatientSortKey)} data-testid="select-patient-sort">
          {columns.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button type="button" onClick={()=>changeSort(sort.key)} className="inline-flex items-center gap-1 rounded-lg border border-input px-3 py-2 text-xs" aria-label={`Sort ${sort.direction==="asc"?"descending":"ascending"}`} data-testid="button-patient-sort-direction">
          {sort.direction==="asc"?<ArrowUp className="h-3.5 w-3.5"/>:<ArrowDown className="h-3.5 w-3.5"/>}{sort.direction==="asc"?"Ascending":"Descending"}
        </button>
      </div>

      {list.isLoading ? <SkeletonRows rows={8} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data?.length ? (
        <EmptyState icon={<UserRound className="h-4 w-4" />} title="No patients match" desc="Try a different search, or add a synthetic patient." action={<Btn variant="primary" onClick={() => setOpen(true)}>Add patient</Btn>} />
      ) : (
        <div className="rise overflow-hidden rounded-xl border border-card-border bg-card">
          <div className={cn("hidden gap-3 border-b border-border bg-muted/50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid",patientGrid)}>
            {columns.map(c=>{
              const active=sort.key===c.key, Icon=active?(sort.direction==="asc"?ArrowUp:ArrowDown):ArrowUpDown;
              return <button key={c.key} type="button" onClick={()=>changeSort(c.key)} className={cn("flex min-w-0 items-center gap-1 rounded-sm py-1 text-left uppercase tracking-wider transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",c.right&&"flex-row-reverse text-right",active&&"text-foreground")} aria-label={`Sort by ${c.label}${active?`, currently ${sort.direction==="asc"?"ascending":"descending"}`:""}`} aria-pressed={active} data-testid={`sort-patients-${c.key}`}>
                <span className="truncate">{c.label}</span><Icon className={cn("h-3 w-3 shrink-0",!active&&"opacity-50")} strokeWidth={1.6}/>
              </button>;
            })}
          </div>
          <PagedList key={`${sort.key}:${sort.direction}:${debounced}:${program}:${status}`} items={sorted} pageSize={25} noun="patients" testid="pager-patients" render={(p) => (
            <Link key={p.id} href={`/patients/${p.id}`} className={cn("grid grid-cols-1 gap-2 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/40 lg:items-center lg:gap-3",patientGrid)} data-testid={`row-patient-${p.id}`}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground">{initials(`${p.firstName} ${p.lastName}`)}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium" title={`${p.lastName}, ${p.firstName}`}>{p.lastName}, {p.firstName}</div>
                  <div className="truncate text-xs text-muted-foreground" title={p.conditions?.join(", ")}>{p.conditions?.length ? p.conditions.slice(0, 2).join(", ") : "No conditions recorded"}{(p.conditions?.length ?? 0) > 2 ? ` +${(p.conditions?.length ?? 0) - 2}` : ""}</div>
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap gap-1">{p.programs.length ? p.programs.map((g) => <ProgramTag key={g} p={g} />) : <span className="text-xs text-muted-foreground">Not enrolled</span>}</div>
              <div className="min-w-0 truncate text-xs text-muted-foreground" title={p.location}>{p.location}</div>
              <div className="min-w-0"><Pill tone={toneFor(p.risk)} dot>{p.risk}</Pill></div>
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
      {allow("admin")&&<Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Bring in your patient roster</DialogTitle><DialogDescription>Import creates patient records, not program enrollment. Review each chart and capture consent before starting care.</DialogDescription></DialogHeader><PatientImport onClose={()=>setImportOpen(false)} /></DialogContent></Dialog>}
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
  const empty = { firstName: "", lastName: "", dob: "", sex: "", email: "", phone: "", location: "", timezone: "America/New_York", payer: "", careManager: "", conditions: "", medications: "" };
  const [v, setV] = useState(empty);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: PatientInput = {
      firstName: v.firstName.trim(), lastName: v.lastName.trim(), dob: v.dob, sex: v.sex, email: v.email || undefined, phone: v.phone || undefined,
      location: v.location, timezone: v.timezone, payer: v.payer, careManager: v.careManager || undefined, status: "active",
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
            <Field label="Sex"><select className={inputCls} value={v.sex} onChange={set("sex")} data-testid="select-sex"><option value="">Not recorded</option><option value="F">Female</option><option value="M">Male</option><option value="X">Other</option></select></Field>
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
