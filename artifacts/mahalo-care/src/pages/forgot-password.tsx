import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useRequestPasswordReset } from "@workspace/api-client-react";
import { Btn, Field, inputCls } from "@/components/kit";
import { AuthFrame, FormAlert } from "@/components/auth-frame";
import { errMsg } from "@/lib/api";

export default function ForgotPasswordPage() {
  const req = useRequestPasswordReset();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    req.mutate({ data: { email: email.trim() } }, { onSuccess: () => setSent(true), onError: (err) => setError(errMsg(err)) });
  };
  return (
    <AuthFrame eyebrow="Account recovery" title={sent ? "Check with your administrator" : "Reset your password"}
      desc={sent ? undefined : "Enter the email on your Mahalo Care account. If it matches an active account, your practice administrator is notified."}
      footer={<Link href="/login" className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary" data-testid="link-back-login"><ArrowLeft className="h-3.5 w-3.5" />Back to sign in</Link>}>
      {sent ? (
        <div className="fade-in space-y-4" data-testid="state-recovery-requested">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary text-[hsl(var(--brand-cyan))]"><MailCheck className="h-5 w-5" strokeWidth={1.5} /></div>
          <p className="text-sm leading-relaxed">If an account exists for <span className="font-medium">{email.trim()}</span>, a practice administrator is notified. For your privacy we show the same message either way.</p>
          <FormAlert tone="info" testid="note-local-delivery">Local delivery only: no email is sent and no link is generated here. If the email matches an account, a practice administrator is notified and can issue a one-time link from Admin, Accounts. Ask them for it directly.</FormAlert>
          <Btn variant="ghost" onClick={() => { setSent(false); setEmail(""); }} data-testid="button-try-another">Use a different email</Btn>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate={false}>
          <Field label="Email"><input type="email" required maxLength={254} autoComplete="email" className={inputCls + " !h-11"} value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-recovery-email" /></Field>
          {error && <FormAlert testid="text-recovery-error">{error}</FormAlert>}
          <Btn type="submit" variant="primary" className="h-11 w-full" disabled={req.isPending || !email.trim()} data-testid="button-request-recovery">{req.isPending ? "Requesting…" : "Request help"}</Btn>
        </form>
      )}
    </AuthFrame>
  );
}
