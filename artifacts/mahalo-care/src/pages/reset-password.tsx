import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, LinkIcon } from "lucide-react";
import { useResetPassword } from "@workspace/api-client-react";
import { Btn, Field } from "@/components/kit";
import { AuthFrame, FormAlert, PasswordInput, StrengthMeter, passwordProblem } from "@/components/auth-frame";
import { errMsg } from "@/lib/api";

export default function ResetPasswordPage() {
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";
  const tokenOk = /^[A-Za-z0-9_-]{64}$/.test(token);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const reset = useResetPassword();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const problem = passwordProblem(pw, confirm);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (problem) return;
    reset.mutate({ data: { token, password: pw } }, {
      onSuccess: () => { qc.clear(); setDone(true); window.setTimeout(() => setLocation("/login"), 1800); },
      onError: (err) => setError(errMsg(err)),
    });
  };
  const back = <Link href="/login" className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary" data-testid="link-back-login"><ArrowLeft className="h-3.5 w-3.5" />Back to sign in</Link>;
  if (!tokenOk) {
    return (
      <AuthFrame eyebrow="Set password" title="This link isn't complete" desc="The invitation or recovery link is missing its token or was copied only partly. Open the full link again, or request a new one." footer={back}>
        <div className="flex flex-col gap-3" data-testid="state-token-missing">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary text-[hsl(var(--brand-orange))]"><LinkIcon className="h-5 w-5" strokeWidth={1.5} /></div>
          <Link href="/forgot-password" className="inline-flex h-10 items-center justify-center rounded-full border border-input bg-card text-sm font-medium hover:bg-secondary" data-testid="link-request-new">Request a new link</Link>
        </div>
      </AuthFrame>
    );
  }
  if (done) {
    return (
      <AuthFrame eyebrow="Set password" title="Password saved" desc="You can now sign in with your new password. Taking you to sign in." footer={back}>
        <div className="fade-in flex items-center gap-3 text-sm" data-testid="state-reset-done"><CheckCircle2 className="h-5 w-5 text-[hsl(162_60%_34%)]" strokeWidth={1.6} />Any previous sessions were signed out.</div>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame eyebrow="Set password" title="Choose a password" desc="Use 12 to 128 characters. A short sentence you will remember works well." footer={back}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password"><PasswordInput value={pw} onChange={setPw} autoComplete="new-password" testid="input-new-password" invalid={touched && pw.length < 12} /></Field>
        <StrengthMeter pw={pw} />
        <Field label="Confirm new password"><PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" testid="input-confirm-password" invalid={touched && pw !== confirm} /></Field>
        {touched && problem && <FormAlert testid="text-reset-validation">{problem}</FormAlert>}
        {error && <FormAlert testid="text-reset-error">{error} The link may have expired or already been used. <Link href="/forgot-password" className="font-medium underline">Request a new one</Link>.</FormAlert>}
        <Btn type="submit" variant="primary" className="h-11 w-full" disabled={reset.isPending} data-testid="button-reset-password">{reset.isPending ? "Saving…" : "Save password"}</Btn>
      </form>
    </AuthFrame>
  );
}
