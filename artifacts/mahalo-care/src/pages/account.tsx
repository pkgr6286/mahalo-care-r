import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, LogOut, MapPin, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useChangePassword, useGetCurrentUser, getGetCurrentUserQueryKey, useListSessions, getListSessionsQueryKey, useRevokeSession, type SessionInfo } from "@workspace/api-client-react";
import { Btn, ConfirmButton, EmptyState, ErrorState, Field, PageHeader, Panel, Pill, SkeletonRows } from "@/components/kit";
import { FormAlert, PasswordInput, StrengthMeter, passwordProblem } from "@/components/auth-frame";
import { errMsg, fmtDateTime, fmtRel } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const ROLE_LABEL: Record<string, string> = { admin: "Administrator", clinical_admin: "Clinical administrator", billing_provider: "Billing provider", care_manager: "Care manager", therapist: "Therapist", front_desk: "Front desk", billing: "Billing", read_only: "Read only", patient: "Patient", behavioral_care_manager: "Behavioral care manager", psychiatric_consultant: "Psychiatric consultant" };
export const roleLabel = (r: string) => ROLE_LABEL[r] ?? r.replace(/_/g, " ");

export default function AccountPage() {
  const me = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const user = me.data;
  if (!user) return <SkeletonRows rows={4} />;
  const patient = user.role === "patient";
  return (
    <div className={patient ? "mx-auto w-full max-w-xl px-4 py-6" : ""}>
      {patient && <Link href="/patient" className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground" data-testid="link-back-patient"><ArrowLeft className="h-4 w-4" />Back to my care</Link>}
      <PageHeader eyebrow="Your account" title={patient ? "Sign-in and security" : "Account and sessions"} desc={patient ? "Only you can see this page. Changes here affect how you sign in, never your care record." : "Your own password and where you're signed in."} />
      <div className={patient ? "space-y-5" : "grid gap-5 lg:grid-cols-[1fr_1.15fr]"}>
        <div className="space-y-5">
          <Panel title="Profile">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(var(--brand-orange))]/40 bg-accent text-sm font-semibold text-accent-foreground">{user.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</div>
              <div className="min-w-0">
                <div className="truncate font-medium" data-testid="text-account-name">{user.name}{user.credential && !patient ? ", " + user.credential : ""}</div>
                <div className="truncate text-xs text-muted-foreground" data-testid="text-account-email">{user.email}</div>
              </div>
              <span className="ml-auto"><Pill tone="neutral">{roleLabel(user.role)}</Pill></span>
            </div>
            {!patient && (
              <div className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground" data-testid="text-account-scopes">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
                {(user.locationScopes ?? []).length ? <span>Sites: {(user.locationScopes ?? []).join(", ")}</span> : <span>All practice sites</span>}
              </div>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">Name, role and site access are managed by a practice administrator.</p>
          </Panel>
          <ChangePassword />
        </div>
        <Sessions />
      </div>
    </div>
  );
}

function ChangePassword() {
  const change = useChangePassword();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = !cur ? "Enter your current password." : passwordProblem(pw, confirm);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (problem) return;
    change.mutate({ data: { currentPassword: cur, password: pw } }, {
      onSuccess: () => { qc.clear(); setLocation("/login"); },
      onError: (err) => setError(errMsg(err)),
    });
  };
  return (
    <Panel title={<span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Change password</span>} sub="Signs you out everywhere, including this device">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Current password"><PasswordInput value={cur} onChange={setCur} autoComplete="current-password" testid="input-current-password" /></Field>
        <Field label="New password"><PasswordInput value={pw} onChange={setPw} autoComplete="new-password" testid="input-new-password" invalid={touched && pw.length < 12} /></Field>
        <StrengthMeter pw={pw} />
        <Field label="Confirm new password"><PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" testid="input-confirm-password" invalid={touched && pw !== confirm} /></Field>
        {touched && problem && <FormAlert testid="text-change-validation">{problem}</FormAlert>}
        {error && <FormAlert testid="text-change-error">{error}</FormAlert>}
        <Btn type="submit" variant="primary" disabled={change.isPending} data-testid="button-change-password">{change.isPending ? "Updating…" : "Update password and sign out"}</Btn>
      </form>
    </Panel>
  );
}

function Sessions() {
  const q = useListSessions({ query: { queryKey: getListSessionsQueryKey(), refetchInterval: 60_000, refetchOnWindowFocus: true } });
  const revoke = useRevokeSession();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const doRevoke = (s: SessionInfo, close: () => void) =>
    revoke.mutate({ sessionId: s.id }, {
      onSuccess: () => {
        close();
        if (s.current) { qc.clear(); setLocation("/login"); return; }
        toast({ title: "Session signed out" });
        qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      },
      onError: (err) => toast({ title: "Could not sign out session", description: errMsg(err), variant: "destructive" }),
    });
  const list = [...(q.data ?? [])].sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt.localeCompare(a.lastSeenAt));
  return (
    <Panel title={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />Where you're signed in</span>} sub="Sign out any session you don't recognize" bodyClass="p-0">
      {q.isLoading ? <div className="p-4"><SkeletonRows rows={3} /></div> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : !list.length ? <div className="p-4"><EmptyState title="No active sessions" icon={<MonitorSmartphone className="h-4 w-4" strokeWidth={1.6} />} /></div> : (
        <ul>
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0" data-testid={"row-session-" + s.id}>
              <div className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full border " + (s.current ? "border-[hsl(var(--brand-orange))]/40 bg-accent text-accent-foreground" : "border-border bg-secondary text-muted-foreground")}><MonitorSmartphone className="h-4 w-4" strokeWidth={1.6} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">{s.current ? "This device" : "Other session"}{s.current && <Pill tone="green" dot>Current</Pill>}</div>
                <div className="text-xs text-muted-foreground">Active {fmtRel(s.lastSeenAt)} · started {fmtDateTime(s.createdAt)} · expires {fmtDateTime(s.expiresAt)}</div>
              </div>
              <ConfirmButton size="sm" variant={s.current ? "danger" : "secondary"} label={s.current ? "Sign out" : "Revoke"} icon={<LogOut className="h-3.5 w-3.5" />} title={s.current ? "Sign out this device?" : "Revoke this session?"} desc={s.current ? "You'll return to the sign-in page." : "That device will need to sign in again."} confirmLabel={s.current ? "Sign out" : "Revoke"} pending={revoke.isPending} onConfirm={(_, c) => doRevoke(s, c)} testid={"button-revoke-" + s.id} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
