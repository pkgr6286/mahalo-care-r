import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartHandshake, Info, Plus, ShieldOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, EmptyState, ErrorState, Field, Panel, Pill, SkeletonRows, inputCls, type Tone } from "@/components/kit";
import { usePermission } from "@/components/access";
import { jsonFetch } from "@/lib/http";
import { errMsg, fmtDate } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Scope = "careplans.read" | "readings.read" | "tasks.read" | "messages.read" | "messages.send" | "education.read" | "appointments.read";
const CONTACT_SCOPE: Record<Scope, string> = { "careplans.read": "careplans", "readings.read": "readings", "tasks.read": "tasks", "messages.read": "messages", "messages.send": "messages", "education.read": "education", "appointments.read": "appointments" };
type Grant = { id: string; caregiverName: string; email: string; scopes: Scope[]; status: string; effectiveStatus: string; grantedAt: string; expiresAt?: string | null; reason?: string | null };
type Contact = { id: string; name: string; email?: string | null; relationship?: string | null; sharingAllowed: boolean; sharingScope: string[]; eligibleAccount: { id: string; name: string; email: string; status: string } | null };
type Data = { grants: Grant[]; contacts: Contact[] };

const SCOPES: { id: Scope; label: string; desc: string }[] = [
  { id: "careplans.read", label: "Care plans", desc: "Plans, goals and PDF copies" },
  { id: "readings.read", label: "Readings", desc: "Recent device and app readings" },
  { id: "tasks.read", label: "Tasks", desc: "Upcoming follow-ups" },
  { id: "education.read", label: "Education", desc: "Assigned learning material" },
  { id: "appointments.read", label: "Appointments", desc: "Scheduled visits (local video workflow)" },
  { id: "messages.read", label: "Read messages", desc: "Care team conversation" },
  { id: "messages.send", label: "Send messages", desc: "Requires read messages" },
];
const STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "green" }, revoked: { label: "Revoked", tone: "neutral" }, expired: { label: "Expired", tone: "neutral" },
  permission_withdrawn: { label: "Contact permission withdrawn", tone: "amber" }, contact_unavailable: { label: "Contact removed", tone: "amber" },
};
const key = (id: string) => ["/api/patients", id, "caregivers"];

export function CaregiverAccessPanel({ patientId }: { patientId: string }) {
  const { allow } = usePermission();
  const canWrite = allow("clinical.write");
  const q = useQuery({ queryKey: key(patientId), queryFn: () => jsonFetch<Data>(`/patients/${encodeURIComponent(patientId)}/caregivers`) });
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<Grant | null>(null);
  const grants = [...(q.data?.grants ?? [])].sort((a, b) => (a.effectiveStatus === "active" ? 0 : 1) - (b.effectiveStatus === "active" ? 0 : 1) || b.grantedAt.localeCompare(a.grantedAt));
  return (
    <Panel title={<span className="flex items-center gap-2"><HeartHandshake className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Caregiver portal access</span>} sub="Family members who can sign in and see selected parts of this chart" action={canWrite && q.data ? <Btn size="sm" onClick={() => setGranting(true)} data-testid="button-grant-caregiver"><Plus className="h-3.5 w-3.5" />Grant access</Btn> : undefined} bodyClass="p-0">
      <p className="border-b border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground" data-testid="note-grant-lifecycle">Editing a contact's sharing, consent or email automatically revokes their grant. Revoked grants stay in history and are never reactivated; record a new grant if access should continue.</p>
      {q.isLoading ? <div className="p-4"><SkeletonRows rows={2} /></div> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : !grants.length ? (
        <div className="p-4"><EmptyState title="No caregiver access" desc="Access requires a listed contact with sharing permission, a caregiver account invited by an administrator, and documented patient consent." /></div>
      ) : grants.map((g) => {
        const st = STATUS[g.effectiveStatus] ?? { label: g.effectiveStatus.replace(/_/g, " "), tone: "neutral" as Tone };
        return (
          <div key={g.id} className={cn("flex flex-col gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:items-start", g.effectiveStatus !== "active" && "opacity-75")} data-testid={`row-grant-${g.id}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{g.caregiverName}</span><span className="text-xs text-muted-foreground">{g.email}</span><Pill tone={st.tone}>{st.label}</Pill>{(g.effectiveStatus === "permission_withdrawn" || g.effectiveStatus === "contact_unavailable") && <span className="text-[11px] text-muted-foreground">Needs a new grant to restore</span>}</div>
              <div className="mt-1 flex flex-wrap gap-1">{g.scopes.map((s) => <span key={s} className="rounded border border-border px-1.5 text-[11px] text-muted-foreground">{SCOPES.find((x) => x.id === s)?.label ?? s}</span>)}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Granted {fmtDate(g.grantedAt)}{g.expiresAt ? ` · ${g.effectiveStatus === "expired" ? "expired" : "expires"} ${fmtDate(g.expiresAt)}` : " · no end date"}{g.reason && g.effectiveStatus === "revoked" ? ` · ${g.reason}` : ""}</div>
            </div>
            {canWrite && g.effectiveStatus === "active" && <Btn size="sm" variant="ghost" onClick={() => setRevoking(g)} data-testid={`button-revoke-${g.id}`}><ShieldOff className="h-3.5 w-3.5" />Revoke</Btn>}
          </div>
        );
      })}
      {granting && q.data && <GrantDialog patientId={patientId} contacts={q.data.contacts} onClose={() => setGranting(false)} />}
      {revoking && <RevokeDialog patientId={patientId} grant={revoking} onClose={() => setRevoking(null)} />}
    </Panel>
  );
}

function contactBlocker(c: Contact): string | null {
  if (!c.sharingAllowed) return "Sharing permission not recorded on this contact. Edit Contacts first.";
  if (!c.eligibleAccount) return "No matching caregiver account. An administrator must invite a Family caregiver account with this contact's email.";
  if (c.eligibleAccount.status !== "active") return `Caregiver account is ${c.eligibleAccount.status}. They must finish setting up their sign-in first.`;
  return null;
}

function GrantDialog({ patientId, contacts, onClose }: { patientId: string; contacts: Contact[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [contactId, setContactId] = useState("");
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [method, setMethod] = useState<"verbal" | "written">("verbal");
  const [consentText, setConsentText] = useState("");
  const [attested, setAttested] = useState(false);
  const [expires, setExpires] = useState("");
  const [error, setError] = useState<string | null>(null);
  const c = contacts.find((x) => x.id === contactId);
  const blocker = c ? contactBlocker(c) : null;
  const permitted = (s: Scope) => !!c && c.sharingScope.includes(CONTACT_SCOPE[s]);
  const beyond = scopes.filter((s) => !permitted(s));
  const toggle = (s: Scope) => setScopes((cur) => {
    if (cur.includes(s)) return cur.filter((x) => x !== s && !(s === "messages.read" && x === "messages.send"));
    return [...cur, s];
  });
  const valid = !!c && !blocker && scopes.length > 0 && !beyond.length && consentText.trim().length >= 20 && attested && (!expires || new Date(expires) > new Date());
  const grant = useMutation({
    mutationFn: () => jsonFetch(`/patients/${encodeURIComponent(patientId)}/caregivers`, { method: "POST", body: JSON.stringify({ contactId, userId: c!.eligibleAccount!.id, scopes, method, consentText: consentText.trim(), attested: true, ...(expires ? { expiresAt: new Date(expires + "T23:59:59").toISOString() } : {}) }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key(patientId) }); toast({ title: "Caregiver access granted", description: `${c!.name} can now sign in and see the selected sections.` }); onClose(); },
    onError: (e) => setError(errMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !grant.isPending) onClose(); }}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Grant caregiver access</DialogTitle>
          <DialogDescription>Choose exactly what this person may see. Nothing is shared by default.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6} /><span>Three things must be in place: the person is listed in Contacts with sharing permitted, an administrator has invited them as a Family caregiver account using the same email, and you document the patient's consent below.</span></div>
        <Field label="Contact">
          <select className={inputCls} value={contactId} onChange={(e) => { setContactId(e.target.value); setScopes([]); setError(null); }} data-testid="select-grant-contact">
            <option value="">Select a contact</option>
            {contacts.map((x) => <option key={x.id} value={x.id}>{x.name}{x.relationship ? ` (${x.relationship})` : ""}{contactBlocker(x) ? " · not eligible" : ""}</option>)}
          </select>
          {!contacts.length && <span className="mt-1 block text-[11px] text-muted-foreground">No contacts listed. Add one in the Contacts section of the profile.</span>}
        </Field>
        {c && (blocker ? <p className="rounded-lg border border-[hsl(38_80%_80%)] bg-[hsl(38_95%_96.5%)] px-3 py-2 text-xs text-[hsl(30_70%_26%)]" data-testid="text-grant-blocker">{blocker}</p>
          : <p className="text-xs text-muted-foreground">Signs in as <span className="font-medium text-foreground">{c.eligibleAccount!.name}</span> · {c.eligibleAccount!.email}{c.sharingScope.length ? ` · contact permits: ${c.sharingScope.join(", ")}` : ""}</p>)}
        <fieldset disabled={!c || !!blocker}>
          <legend className="mb-1.5 text-xs font-medium">Sections to share</legend>
          {c && !blocker && <p className="mb-2 text-[11px] text-muted-foreground" data-testid="text-scope-help">Limited to what this contact's sharing permission allows ({c.sharingScope.length ? c.sharingScope.join(", ") : "nothing yet"}). To share more, first update the contact's permission in Contacts.</p>}
          <div className="grid gap-1.5 sm:grid-cols-2">
            {SCOPES.map((s) => {
              const notAllowed = !permitted(s.id);
              const dis = (notAllowed && !scopes.includes(s.id)) || (s.id === "messages.send" && !scopes.includes("messages.read"));
              return (
                <label key={s.id} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", scopes.includes(s.id) ? "border-[hsl(var(--brand-orange))]/50 bg-[hsl(var(--brand-orange)/0.05)]" : "border-border", dis && "opacity-50")}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={scopes.includes(s.id)} disabled={dis} onChange={() => toggle(s.id)} data-testid={`check-scope-${s.id}`} />
                  <span><span className="block">{s.label}</span><span className="text-[11px] text-muted-foreground">{notAllowed ? "Not permitted for this contact" : s.desc}</span></span>
                </label>
              );
            })}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Consent obtained"><div className="flex gap-1.5">{(["verbal", "written"] as const).map((m) => <button key={m} type="button" onClick={() => setMethod(m)} className={cn("h-9 flex-1 rounded-md border text-sm capitalize", method === m ? "border-[hsl(var(--brand-charcoal))] bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))]" : "border-input bg-card")} data-testid={`button-method-${m}`}>{m}</button>)}</div></Field>
            <Field label="Ends on" hint="Optional"><input type="date" className={inputCls} value={expires} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpires(e.target.value)} data-testid="input-grant-expires" /></Field>
          </div>
          <Field label="Consent record" hint={`${consentText.trim().length} / 20 characters minimum`} className="mt-3"><textarea className={cn(inputCls, "h-20 resize-y py-2")} value={consentText} onChange={(e) => setConsentText(e.target.value)} placeholder="What the patient agreed to, when, and who was present" data-testid="input-grant-consent" /></Field>
          <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={attested} onChange={(e) => setAttested(e.target.checked)} data-testid="check-grant-attest" /><span>This records a new grant; earlier revoked access is not reused. The patient (or their legal representative) agreed to share these sections with this person.</span></label>
        </fieldset>
        {beyond.length > 0 && <p role="alert" className="text-xs text-destructive" data-testid="text-scope-beyond">{beyond.map((x) => SCOPES.find((y) => y.id === x)?.label).join(", ")} exceed{beyond.length === 1 ? "s" : ""} this contact's sharing permission. Remove {beyond.length === 1 ? "it" : "them"} or update the contact first.</p>}
        {error && <p role="alert" className="text-xs text-destructive" data-testid="text-grant-error">{error}</p>}
        <DialogFooter>
          <Btn variant="ghost" onClick={onClose} disabled={grant.isPending}>Cancel</Btn>
          <Btn variant="primary" disabled={!valid || grant.isPending} onClick={() => { setError(null); grant.mutate(); }} data-testid="button-confirm-grant">{grant.isPending ? "Granting…" : "Grant access"}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({ patientId, grant: g, onClose }: { patientId: string; grant: Grant; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => jsonFetch(`/patients/${encodeURIComponent(patientId)}/caregivers/${encodeURIComponent(g.id)}/revoke`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key(patientId) }); toast({ title: "Access revoked", description: `${g.caregiverName} can no longer see this record.` }); onClose(); },
    onError: (e) => setError(errMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !m.isPending) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Revoke access for {g.caregiverName}</DialogTitle><DialogDescription>Takes effect immediately. The grant stays in the history.</DialogDescription></DialogHeader>
        <Field label="Reason" hint={`${reason.trim().length} / 10 characters minimum`}><textarea className={cn(inputCls, "h-20 resize-y py-2")} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus data-testid="input-revoke-reason" /></Field>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Btn variant="ghost" onClick={onClose} disabled={m.isPending}>Cancel</Btn>
          <Btn variant="primary" disabled={reason.trim().length < 10 || m.isPending} onClick={() => { setError(null); m.mutate(); }} data-testid="button-confirm-revoke">{m.isPending ? "Revoking…" : "Revoke access"}</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
