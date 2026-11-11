import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Check, Copy, ExternalLink, KeyRound, Lock, MapPin, Pencil, Search, ShieldOff, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useListAccounts, getListAccountsQueryKey, useCreateAccount, useUpdateAccount, useIssueAccountInvitation, useListRecords, getListRecordsQueryKey,
  useListPatients, getListPatientsQueryKey, useGetCurrentUser, getGetCurrentUserQueryKey,
  AccountRole, AccountInputCredential, type Account, type AccountInvitation,
} from "@workspace/api-client-react";
import { Btn, ConfirmButton, EmptyState, ErrorState, Field, Pill, SimLabel, SkeletonRows, StatusPill, inputCls } from "@/components/kit";
import { FormAlert } from "@/components/auth-frame";
import { roleLabel } from "@/pages/account";
import { errMsg, fmtDateTime, fmtRel, initials } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Role = (typeof AccountRole)[keyof typeof AccountRole] | "caregiver";
type Cred = (typeof AccountInputCredential)[keyof typeof AccountInputCredential] | "caregiver";
const ROLES = [...Object.values(AccountRole), "caregiver"] as Role[];
const CREDS = [...Object.values(AccountInputCredential), "caregiver"] as Cred[];
const credLabel = (c: string) => (c === "psych_consultant" ? "Psychiatric consultant" : c === "admin" ? "Administrative" : c === "billing" ? "Billing" : c === "patient" ? "Patient" : c === "caregiver" ? "Family caregiver" : c);
const SITE_ROLES = ["clinical_admin", "billing_provider", "care_manager", "behavioral_care_manager", "psychiatric_consultant", "therapist", "front_desk", "billing", "read_only"] as const;
type SiteRow = { loc: string; role: string };
/** NPI check digit (Luhn with the 80840 prefix). Format check only, not licensure verification. */
export function npiChecksumOk(npi: string) {
  if (!/^\d{10}$/.test(npi)) return false;
  const digits = ("80840" + npi.slice(0, 9)).split("").map(Number);
  let sum = 0;
  digits.reverse().forEach((d, i) => { let v = i % 2 === 0 ? d * 2 : d; if (v > 9) v -= 9; sum += v; });
  return (10 - (sum % 10)) % 10 === Number(npi[9]);
}
const DEFAULT_CRED: Partial<Record<Role, Cred>> = { behavioral_care_manager: "LCSW", psychiatric_consultant: "psych_consultant", admin: "admin", billing: "billing", billing_provider: "MD", patient: "patient", caregiver: "caregiver", care_manager: "RN", therapist: "PT", front_desk: "MA", clinical_admin: "RN", read_only: "admin" };

function inviteUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "") + path;
}

export function AccountsTab() {
  const q = useListAccounts({ query: { queryKey: getListAccountsQueryKey(), refetchInterval: 30_000, refetchOnWindowFocus: true } });
  const me = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const [s, setS] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "invited" | "inactive">("all");
  const [editing, setEditing] = useState<Account | null | "new">(null);
  const [invite, setInvite] = useState<AccountInvitation | null>(null);
  const list = useMemo(() => (q.data ?? []).filter((a) => (filter === "all" || a.status === filter) && `${a.name} ${a.email} ${a.role}`.toLowerCase().includes(s.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [q.data, filter, s]);
  const counts = useMemo(() => { const c = { all: 0, active: 0, invited: 0, inactive: 0 } as Record<string, number>; (q.data ?? []).forEach((a) => { c.all++; c[a.status] = (c[a.status] ?? 0) + 1; }); return c; }, [q.data]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-xs text-muted-foreground" data-testid="note-accounts">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--brand-cyan))]" strokeWidth={1.6} />
        <span className="min-w-0 flex-1">Sign-in accounts grant access. Role sets what someone can do; site scopes limit which locations' patients they see. This is separate from the Staff directory, which only lists people.</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.6} />
          <input className={inputCls + " pl-8"} placeholder="Search name, email or role" aria-label="Search accounts" value={s} onChange={(e) => setS(e.target.value)} data-testid="input-account-search" />
        </div>
        <div className="flex rounded-full border border-border bg-card p-0.5" role="tablist" aria-label="Filter by status">
          {(["all", "active", "invited", "inactive"] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors", filter === f ? "bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))]" : "text-muted-foreground hover:text-foreground")} data-testid={`filter-accounts-${f}`}>
              {f} <span className="tnum opacity-60">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        <Btn variant="primary" onClick={() => setEditing("new")} data-testid="button-new-account"><UserPlus className="h-4 w-4" />Invite account</Btn>
      </div>

      {q.isLoading ? <SkeletonRows rows={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !list.length ? (
        <EmptyState icon={<Users className="h-4 w-4" strokeWidth={1.6} />} title={q.data?.length ? "No accounts match" : "No accounts yet"} desc={q.data?.length ? "Try a different search or status." : "Invite the first teammate or patient to give them sign-in access."} action={!q.data?.length ? <Btn variant="primary" size="sm" onClick={() => setEditing("new")}>Invite account</Btn> : undefined} />
      ) : (
        <div className="rise overflow-hidden rounded-xl border border-card-border bg-card">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_120px_auto] gap-3 border-b border-border bg-secondary/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground md:grid">
            <span>Person</span><span>Role</span><span>Sites</span><span>Last sign-in</span><span className="w-[220px] text-right">Actions</span>
          </div>
          {list.map((a) => <AccountRow key={a.id} a={a} self={a.id === me.data?.id} onEdit={() => setEditing(a)} onInvite={setInvite} />)}
        </div>
      )}
      <AccountDialog key={editing === "new" ? "new" : editing?.id ?? "none"} target={editing} onClose={() => setEditing(null)} onInvite={setInvite} />
      <InvitationDialog inv={invite} onClose={() => setInvite(null)} />
    </div>
  );
}

function AccountRow({ a, self, onEdit, onInvite }: { a: Account; self: boolean; onEdit: () => void; onInvite: (i: AccountInvitation) => void }) {
  const upd = useUpdateAccount();
  const issue = useIssueAccountInvitation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const scopes = a.locationScopes ?? [];
  const siteMap = a.siteRoles ?? {};
  const mapped = Object.keys(siteMap).length > 0;
  const locked = a.lockedUntil && new Date(a.lockedUntil) > new Date();
  const setStatus = (status: "active" | "inactive", close: () => void) =>
    upd.mutate({ accountId: a.id, data: { status } }, {
      onSuccess: () => { close(); qc.invalidateQueries({ queryKey: getListAccountsQueryKey() }); toast({ title: status === "active" ? "Account activated" : "Account deactivated", description: status === "inactive" ? `${a.name} can no longer sign in.` : undefined }); },
      onError: (err) => toast({ title: "Could not update account", description: errMsg(err), variant: "destructive" }),
    });
  const doIssue = (close: () => void) =>
    issue.mutate({ accountId: a.id }, {
      onSuccess: (inv) => { close(); qc.invalidateQueries({ queryKey: getListAccountsQueryKey() }); onInvite(inv); },
      onError: (err) => toast({ title: "Could not issue link", description: errMsg(err), variant: "destructive" }),
    });
  return (
    <div className={cn("grid grid-cols-1 items-center gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_120px_auto] md:gap-3", a.status === "inactive" && "bg-muted/30")} data-testid={`row-account-${a.id}`}>
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold", a.status === "inactive" ? "border-border bg-muted text-muted-foreground" : "border-[hsl(var(--brand-orange))]/35 bg-accent text-accent-foreground")}>{initials(a.name)}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium"><span className="truncate" data-testid={`text-account-name-${a.id}`}>{a.name}</span>{self && <Pill tone="indigo">You</Pill>}<span data-testid={`status-account-${a.id}`}><StatusPill value={a.status} /></span>{locked && <Pill tone="red">Locked</Pill>}</div>
          <div className="truncate text-xs text-muted-foreground">{a.email}</div>
        </div>
      </div>
      <div className="text-sm"><span>{roleLabel(a.role)}</span><span className="text-xs text-muted-foreground"> · {credLabel(a.credential)}</span></div>
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />{mapped ? <span className="truncate" title={Object.entries(siteMap).map(([k, v]) => `${k}: ${roleLabel(v)}`).join("\n")} data-testid={`text-site-roles-${a.id}`}>Role by site · {Object.keys(siteMap).length} location{Object.keys(siteMap).length === 1 ? "" : "s"}</span> : <span className="truncate" title={scopes.join(", ")}>{a.role === "patient" ? "Own record only" : a.role === "caregiver" ? "Patients who granted access" : scopes.length ? scopes.join(", ") : "All sites"}</span>}</div>
      <div className="text-xs text-muted-foreground" title={a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : undefined}>{a.lastLoginAt ? fmtRel(a.lastLoginAt) : a.status === "invited" ? "Awaiting setup" : "Never"}</div>
      <div className="flex flex-wrap items-center justify-start gap-1.5 md:w-[220px] md:justify-end">
        <ConfirmButton size="sm" label={a.status === "invited" ? "Re-invite" : "Recovery link"} icon={<KeyRound className="h-3.5 w-3.5" />} title={a.status === "invited" ? `New invitation for ${a.name}` : `Recovery link for ${a.name}`} desc="Creates a new one-time link and invalidates any earlier link for this account. It is shown to you once; nothing is emailed or logged." confirmLabel="Issue link" pending={issue.isPending} disabled={a.status === "inactive"} onConfirm={(_, c) => doIssue(c)} testid={`button-issue-link-${a.id}`} />
        {a.status === "inactive" ? (
          <ConfirmButton size="sm" label="Activate" icon={<ShieldCheck className="h-3.5 w-3.5" />} title={`Activate ${a.name}?`} desc="They can sign in again with their existing password, or with a new link you issue." confirmLabel="Activate" pending={upd.isPending} onConfirm={(_, c) => setStatus("active", c)} testid={`button-activate-${a.id}`} />
        ) : (
          <ConfirmButton size="sm" variant="danger" label="Deactivate" icon={<ShieldOff className="h-3.5 w-3.5" />} title={`Deactivate ${a.name}?`} desc="Signs them out everywhere and blocks sign-in. Their history and audit trail are kept." confirmLabel="Deactivate" pending={upd.isPending} disabled={self} onConfirm={(_, c) => setStatus("inactive", c)} testid={`button-deactivate-${a.id}`} />
        )}
        <button onClick={onEdit} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Edit ${a.name}`} data-testid={`button-edit-account-${a.id}`}><Pencil className="h-3.5 w-3.5" strokeWidth={1.6} /></button>
      </div>
    </div>
  );
}

function AccountDialog({ target, onClose, onInvite }: { target: Account | null | "new"; onClose: () => void; onInvite: (i: AccountInvitation) => void }) {
  const isNew = target === "new";
  const acct = target && target !== "new" ? target : null;
  const open = !!target;
  const [name, setName] = useState(acct?.name ?? "");
  const [email, setEmail] = useState(acct?.email ?? "");
  const [role, setRole] = useState<Role>((acct?.role as Role) ?? "care_manager");
  const [cred, setCred] = useState<Cred>((acct?.credential as Cred) ?? "RN");
  const [scopes, setScopes] = useState<string[]>(acct?.locationScopes ?? []);
  const [patientId, setPatientId] = useState(acct?.patientId ?? "");
  const initialMap = acct?.siteRoles ?? {};
  const [npi, setNpi] = useState(acct?.npi ?? "");
  const [perSite, setPerSite] = useState(Object.keys(initialMap).length > 0);
  const [siteRows, setSiteRows] = useState<SiteRow[]>(Object.entries(initialMap).map(([loc, r]) => ({ loc, role: r })));
  const [error, setError] = useState<string | null>(null);
  const locs = useListRecords("locations", { query: { enabled: open, queryKey: getListRecordsQueryKey("locations") } });
  const patients = useListPatients(undefined, { query: { enabled: open && isNew && role === "patient", queryKey: getListPatientsQueryKey() } });
  const create = useCreateAccount();
  const upd = useUpdateAccount();
  const qc = useQueryClient();
  const { toast } = useToast();
  const pending = create.isPending || upd.isPending;
  const isPatient = role === "patient";
  const isCaregiver = role === "caregiver";
  const fixedRole = !isNew && (acct?.role === "patient" || acct?.role === "caregiver");
  const baseRoleOf = acct?.baseRole;
  const siteModeAllowed = role !== "admin" && !isPatient && !isCaregiver;
  const usePerSite = perSite && siteModeAllowed;
  const togglePerSite = (on: boolean) => {
    if (on) { setPerSite(true); if (!siteRows.length) setSiteRows(scopes.length ? scopes.map((loc) => ({ loc, role: (SITE_ROLES as readonly string[]).includes(role) ? role : "care_manager" })) : [{ loc: "", role: (SITE_ROLES as readonly string[]).includes(role) ? role : "care_manager" }]); }
    else { setPerSite(false); const locsAssigned = siteRows.map((r) => r.loc).filter(Boolean); if (locsAssigned.length) setScopes(locsAssigned); }
  };

  const changeRole = (r: Role) => { setRole(r); if (isNew && DEFAULT_CRED[r]) setCred(DEFAULT_CRED[r]!); };
  const toggle = (t: string) => setScopes((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter a name.");
    if (isNew && isPatient && !patientId) return setError("Choose the patient record this account opens.");
    const npiVal = npi.trim();
    if (npiVal && !npiChecksumOk(npiVal)) return setError("NPI must be 10 digits with a valid check digit.");
    const rows = siteRows.filter((r) => r.loc);
    if (usePerSite && !rows.length) return setError("Add at least one location and role, or turn off different roles by location.");
    if (usePerSite && new Set(rows.map((r) => r.loc)).size !== rows.length) return setError("Each location can appear only once.");
    const siteRoles: Record<string, string> = usePerSite ? Object.fromEntries(rows.map((r) => [r.loc, r.role])) : {};
    const locationScopes = isPatient || isCaregiver ? [] : usePerSite ? rows.map((r) => r.loc) : scopes;
    const extraFields = isPatient || isCaregiver ? { siteRoles: {} } : { npi: npiVal || null, siteRoles };
    const credential = isCaregiver ? "caregiver" : cred;
    const done = () => qc.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    if (isNew) {
      create.mutate({ data: { name: name.trim(), email: email.trim(), role, credential, locationScopes, ...extraFields, ...(isPatient ? { patientId } : {}) } as Parameters<typeof create.mutate>[0]["data"] }, {
        onSuccess: (inv) => { done(); onClose(); onInvite(inv); },
        onError: (err) => setError(errMsg(err)),
      });
    } else if (acct) {
      upd.mutate({ accountId: acct.id, data: { name: name.trim(), role, credential, locationScopes, ...extraFields } as Parameters<typeof upd.mutate>[0]["data"] }, {
        onSuccess: () => { done(); onClose(); toast({ title: "Account updated", description: "Role and site changes apply on their next request." }); },
        onError: (err) => setError(errMsg(err)),
      });
    }
  };
  const locNames = (locs.data ?? []).map((l) => l.title);
  const extra = scopes.filter((s) => !locNames.includes(s));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Invite account" : `Edit ${acct?.name ?? "account"}`}</DialogTitle>
          <DialogDescription>{isNew ? "Creates a sign-in account in the invited state and returns a one-time link to set a password." : "Email and linked patient can't change. Deactivate and invite again if they're wrong."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" id="account-form">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name"><input className={inputCls} maxLength={100} required value={name} onChange={(e) => setName(e.target.value)} data-testid="input-account-name" /></Field>
            <Field label="Email" hint={isNew ? undefined : "Locked after creation"}><input type="email" className={cn(inputCls, !isNew && "bg-muted text-muted-foreground")} maxLength={254} required disabled={!isNew} value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-account-email" /></Field>
            <Field label="Role">
              <select className={inputCls} value={role} onChange={(e) => changeRole(e.target.value as Role)} disabled={fixedRole} data-testid="select-account-role">
                {ROLES.filter((r) => isNew || (fixedRole ? r === acct?.role : r !== "patient" && r !== "caregiver")).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </Field>
            <Field label="Credential">
              <select className={inputCls} value={isCaregiver ? "caregiver" : cred} disabled={isCaregiver} onChange={(e) => setCred(e.target.value as Cred)} data-testid="select-account-credential">
                {CREDS.filter((c) => isCaregiver ? c === "caregiver" : c !== "caregiver").map((c) => <option key={c} value={c}>{credLabel(c)}</option>)}
              </select>
            </Field>
          </div>
          {isCaregiver ? (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="note-caregiver-account">A family caregiver account opens no records by itself. A clinician grants access per patient from that patient's Clinical profile, after the person is listed as a contact with sharing permission and the patient's consent is documented.</div>
          ) : isPatient ? (
            isNew ? (
              <Field label="Linked patient record" hint="The patient sees only this record. This can't be changed later.">
                <select className={inputCls} value={patientId} onChange={(e) => setPatientId(e.target.value)} disabled={patients.isLoading} data-testid="select-account-patient">
                  <option value="">{patients.isLoading ? "Loading patients…" : "Select patient"}</option>
                  {(patients.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.lastName}, {p.firstName} · {p.mrn}</option>)}
                </select>
                {patients.isError && <span className="mt-1 block text-[11px] text-destructive">Couldn't load patients. {errMsg(patients.error)}</span>}
              </Field>
            ) : <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Patient accounts are limited to their linked record ({acct?.patientId ?? "not linked"}).</div>
          ) : (<>
            <Field label="NPI" hint="Optional · 10 digits. Checks the format and check digit only; does not verify licensure.">
              <input inputMode="numeric" maxLength={10} className={cn(inputCls, "tnum", npi.trim() && !npiChecksumOk(npi.trim()) && "border-destructive")} value={npi} onChange={(e) => setNpi(e.target.value.replace(/\D/g, ""))} placeholder="Leave blank if none" data-testid="input-account-npi" />
              {npi.trim().length === 10 && !npiChecksumOk(npi.trim()) && <span className="mt-1 block text-[11px] text-destructive">Check digit doesn't match. Re-check the number.</span>}
            </Field>
            <div className="rounded-xl border border-border p-3" data-testid="section-site-roles">
              <label className={cn("flex items-start gap-2 text-sm", !siteModeAllowed && "opacity-60")}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={usePerSite} disabled={!siteModeAllowed} onChange={(e) => togglePerSite(e.target.checked)} data-testid="check-site-roles" />
                <span><span className="font-medium">Different roles by location</span><span className="block text-[11px] text-muted-foreground">{!siteModeAllowed ? (role === "admin" ? "Not available for practice administrators, who act across all sites." : "Not available for this account type.") : "They choose one location at a time and get only that location's role. Roles are never combined across locations."}</span></span>
              </label>
              {usePerSite && (
                <div className="mt-3 space-y-1.5">
                  {siteRows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5" data-testid={`row-site-role-${i}`}>
                      <select aria-label="Location" className={cn(inputCls, "h-8 text-sm")} value={r.loc} onChange={(e) => setSiteRows((rs) => rs.map((x, j) => (j === i ? { ...x, loc: e.target.value } : x)))} data-testid={`select-site-loc-${i}`}>
                        <option value="">Location</option>
                        {[...locNames, ...Object.keys(initialMap).filter((k) => !locNames.includes(k))].map((t) => <option key={t} value={t} disabled={siteRows.some((x, j) => j !== i && x.loc === t)}>{t}</option>)}
                      </select>
                      <select aria-label="Role at this location" className={cn(inputCls, "h-8 text-sm")} value={r.role} onChange={(e) => setSiteRows((rs) => rs.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} data-testid={`select-site-role-${i}`}>
                        {SITE_ROLES.map((x) => <option key={x} value={x}>{roleLabel(x)}</option>)}
                      </select>
                      <button type="button" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Remove location" onClick={() => setSiteRows((rs) => rs.filter((_, j) => j !== i))} data-testid={`button-remove-site-${i}`}><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  <button type="button" className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50" disabled={siteRows.length >= Math.max(locNames.length, 1)} onClick={() => setSiteRows((rs) => [...rs, { loc: "", role: "care_manager" }])} data-testid="button-add-site-role">+ Add location</button>
                  {!siteRows.some((x) => x.loc) && <p className="text-[11px] text-destructive">Assign at least one location.</p>}
                  <p className="text-[11px] text-muted-foreground">The Role above stays as the base role{baseRoleOf ? ` (currently ${roleLabel(baseRoleOf)})` : ""}. If you turn this off, the account goes back to that one role at the locations assigned here.</p>
                </div>
              )}
            </div>
            {!usePerSite && <fieldset>
              <legend className="mb-1 flex w-full items-center justify-between text-xs font-medium text-foreground/80"><span>Site access</span><button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => setScopes([])} data-testid="button-scope-all">All sites</button></legend>
              <div className={cn("rounded-lg border px-3 py-2 text-xs", scopes.length ? "border-border text-muted-foreground" : "border-[hsl(var(--brand-cyan))]/40 bg-[hsl(185_55%_97%)] text-[hsl(188_70%_24%)]")} data-testid="text-scope-summary">
                {scopes.length ? `Limited to ${scopes.length} site${scopes.length > 1 ? "s" : ""}` : "No sites selected: access covers every site, including ones added later."}
              </div>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {locs.isLoading ? <SkeletonRows rows={2} /> : locs.isError ? <span className="text-xs text-destructive">Couldn't load sites.</span> : [...locNames, ...extra].map((t) => (
                  <label key={t} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors", scopes.includes(t) ? "border-[hsl(var(--brand-orange))]/50 bg-accent/60" : "border-border hover:bg-secondary")}>
                    <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={scopes.includes(t)} onChange={() => toggle(t)} data-testid={`checkbox-scope-${t.toLowerCase().replace(/\s+/g, "-")}`} />
                    <span className="truncate">{t}</span>
                  </label>
                ))}
              </div>
            </fieldset>}
          </>)}
          {error && <FormAlert testid="text-account-error">{error}</FormAlert>}
        </form>
        <DialogFooter>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" form="account-form" variant="primary" disabled={pending} data-testid="button-save-account">{pending ? "Saving…" : isNew ? "Create and get link" : "Save changes"}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvitationDialog({ inv, onClose }: { inv: AccountInvitation | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const url = inv ? inviteUrl(inv.path) : "";
  const copy = () => navigator.clipboard.writeText(url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => toast({ title: "Copy failed", description: "Select the link and copy it manually.", variant: "destructive" }));
  return (
    <Dialog open={!!inv} onOpenChange={(o) => { if (!o) { setCopied(false); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>One-time link for {inv?.account.name}</DialogTitle>
          <DialogDescription>Shown once. Share it with {inv?.account.name} directly so they can set their password.</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-[hsl(188_50%_60%)] bg-[hsl(185_55%_97%)] px-3 py-2.5 text-xs text-[hsl(188_70%_24%)]" data-testid="note-synthetic-delivery">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
          <span><span className="font-semibold">Local delivery only. No email was sent.</span> Only a hash of this token is stored, so this is the one time the full link can be shown. Copy it and hand it off safely to the person (synthetic demo).</span>
          <span className="ml-auto shrink-0"><SimLabel text="Local only" /></span>
        </div>
        <div className="rounded-lg border border-border bg-secondary/60 p-3">
          <div className="break-all font-mono text-[11.5px] leading-relaxed" data-testid="text-invitation-link">{url}</div>
          <div className="mt-2 text-[11px] text-muted-foreground" data-testid="text-invitation-expires">Expires {inv ? fmtDateTime(inv.expiresAt) : ""} · works once</div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Btn variant="ghost" onClick={onClose} data-testid="button-close-invitation">Done</Btn>
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-input bg-card px-4 text-sm font-medium hover:bg-secondary" data-testid="link-open-invitation"><ExternalLink className="h-4 w-4" strokeWidth={1.6} />Open</a>
          <Btn variant="primary" onClick={copy} data-testid="button-copy-invitation">{copied ? <><Check className="h-4 w-4" />Copied</> : <><Copy className="h-4 w-4" />Copy link</>}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
