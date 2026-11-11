import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, KeyRound, ShieldCheck, Waves } from "lucide-react";
import { useHealthCheck, useLogin, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { Btn, Field, inputCls } from "@/components/kit";
import { Logo, SyntheticRibbon } from "@/components/shell";
import { errMsg } from "@/lib/api";

const DEMO_EMAIL = "demo@mahalo.care";
const DEMO_PASS = "MahaloDemo2026!";
const PATIENT_EMAIL = "patient@mahalo.care";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const health = useHealthCheck({ query: { retry: 1 } });
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate(
      { data: { email: email.trim(), password } },
      {
        onSuccess: (user) => {
          qc.clear();
          qc.setQueryData(getGetCurrentUserQueryKey(), user);
          qc.invalidateQueries();
          setLocation(user.role === "patient" ? "/patient" : user.permissions?.includes("clinical.read") ? "/" : "/patients");
        },
        onError: (err) => setError(errMsg(err)),
      },
    );
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <SyntheticRibbon />
      <div className="grid flex-1 lg:grid-cols-[1.05fr_1fr]">
        <div className="relative hidden overflow-hidden bg-[hsl(var(--brand-charcoal))] p-12 text-[hsl(var(--background))] lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 grid-faint" />
          <svg className="pointer-events-none absolute -right-40 -bottom-40 h-[620px] w-[620px]" viewBox="0 0 600 600" fill="none" aria-hidden>
            <circle cx="300" cy="300" r="290" stroke="#FF7A21" strokeOpacity=".35" />
            <circle cx="300" cy="300" r="220" stroke="#F44762" strokeOpacity=".3" />
            <circle cx="300" cy="300" r="150" stroke="#20B5D0" strokeOpacity=".3" />
          </svg>
          <div className="relative"><Logo light height={34} /></div>
          <div className="relative max-w-lg rise">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(40_12%_80%)]"><span className="h-1.5 w-1.5 rounded-full bg-[#FF7A21]" />Exception-first care workspace</div>
            <h1 className="text-[48px] leading-[1.04]">See the three patients who need you, not the three hundred who don't.</h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[hsl(40_12%_76%)]">Readings, care plans, contact, time and billing evidence for each patient on one surface, across every site in the practice.</p>
          </div>
          <div className="relative grid grid-cols-3 gap-6 border-t border-white/10 pt-6 text-sm">
            {[
              { i: Waves, t: "Readings to exceptions", d: "Rules triage what changed.", c: "#FF7A21" },
              { i: ShieldCheck, t: "Audit-ready evidence", d: "Time and consent per line.", c: "#F44762" },
              { i: KeyRound, t: "One patient record", d: "No program silos.", c: "#20B5D0" },
            ].map((f) => (
              <div key={f.t}>
                <f.i className="mb-3 h-[18px] w-[18px]" style={{ color: f.c }} strokeWidth={1.5} />
                <div className="font-medium">{f.t}</div>
                <div className="mt-0.5 text-xs text-[hsl(40_12%_70%)]">{f.d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-sm rise">
            <div className="mb-10 lg:hidden"><Logo height={30} /></div>
            <h2 className="text-[34px] leading-tight">Sign in</h2>
            <p className="mt-2 text-sm text-muted-foreground">Care team and patients sign in with email and password.</p>

            <form onSubmit={submit} className="mt-8 space-y-4">
              <Field label="Work email">
                <input type="email" autoComplete="email" className={`${inputCls} !h-11`} value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-email" />
              </Field>
              <Field label="Password">
                <input type="password" autoComplete="current-password" className={`${inputCls} !h-11`} value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="input-password" />
              </Field>
              <div className="-mt-2 flex justify-end"><Link href="/forgot-password" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline" data-testid="link-forgot-password">Forgot password?</Link></div>
              {error && <div className="rounded-lg border border-destructive/25 bg-[hsl(352_80%_97.5%)] px-3 py-2 text-xs text-destructive" data-testid="text-login-error">{error}</div>}
              <Btn type="submit" variant="primary" className="h-11 w-full" disabled={login.isPending} data-testid="button-login">
                {login.isPending ? "Signing in…" : <>Sign in <ArrowRight className="h-4 w-4" /></>}
              </Btn>
            </form>

            <div className="mt-6 rounded-2xl border border-border bg-secondary/60 p-4" data-testid="card-demo-credentials">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Synthetic demo credentials</span>
              {[
                { who: "Staff", sub: "Care team workspace", email: DEMO_EMAIL },
                { who: "Patient", sub: "Patient app, own record only", email: PATIENT_EMAIL },
              ].map((c) => (
                <div key={c.who} className="mt-3 flex items-center gap-3 border-t border-border pt-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{c.who} <span className="font-normal text-muted-foreground">· {c.sub}</span></div>
                    <div className="truncate font-mono text-[11px]">{c.email}</div>
                  </div>
                  <button type="button" className="rounded-full border border-input bg-card px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-[hsl(var(--brand-orange))] hover:text-primary" onClick={() => { setEmail(c.email); setPassword(DEMO_PASS); }} data-testid={`button-fill-${c.who.toLowerCase()}`}>Use {c.who.toLowerCase()}</button>
                </div>
              ))}
              <div className="mt-3 font-mono text-[11px] text-muted-foreground">Password for both: <span className="text-foreground">{DEMO_PASS}</span></div>
            </div>

            <div className="mt-6 flex items-center gap-2 text-[11px] text-muted-foreground" data-testid="status-api">
              <span className={`h-1.5 w-1.5 rounded-full ${health.isSuccess ? "bg-[hsl(152_60%_36%)]" : health.isError ? "bg-destructive" : "bg-muted-foreground pulse-dot"}`} />
              {health.isSuccess ? `Service ${health.data.status}` : health.isError ? "Service unreachable" : "Checking service"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
