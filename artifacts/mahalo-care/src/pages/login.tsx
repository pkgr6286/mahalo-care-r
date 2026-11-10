import { useState } from "react";
import { useLocation } from "wouter";
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
          qc.setQueryData(getGetCurrentUserQueryKey(), user);
          qc.invalidateQueries();
          setLocation(user.role === "patient" ? "/patient" : "/");
        },
        onError: (err) => setError(errMsg(err)),
      },
    );
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <SyntheticRibbon />
      <div className="grid flex-1 lg:grid-cols-[1.05fr_1fr]">
        <div className="relative hidden overflow-hidden bg-foreground p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 opacity-[0.07] grid-faint" />
          <svg className="absolute -right-24 bottom-10 w-[680px] opacity-40" viewBox="0 0 600 200" fill="none" aria-hidden>
            <path d="M0 120 C60 120 70 60 120 60 S180 150 240 150 300 40 360 40 420 130 480 130 540 90 600 90" stroke="hsl(243 90% 72%)" strokeWidth="1.5" />
            <path d="M0 150 C60 150 80 110 130 110 S190 170 250 170 310 90 370 90 430 160 490 160 550 130 600 130" stroke="hsl(243 79% 56%)" strokeWidth="1" />
          </svg>
          <div className="relative"><Logo light /></div>
          <div className="relative max-w-md rise">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(243_90%_78%)]">Exception-first care workspace</div>
            <h1 className="text-[40px] font-semibold leading-[1.08] tracking-tight">See the three patients who need you, not the three hundred who don't.</h1>
            <p className="mt-5 text-[15px] leading-relaxed text-white/65">Readings, care plans, contact, time and billing evidence for each patient on one surface, across every site in the practice.</p>
          </div>
          <div className="relative grid grid-cols-3 gap-6 text-sm">
            {[
              { i: Waves, t: "Readings to exceptions", d: "Rules triage what changed." },
              { i: ShieldCheck, t: "Audit-ready evidence", d: "Time and consent per line." },
              { i: KeyRound, t: "One patient record", d: "No program silos." },
            ].map((f) => (
              <div key={f.t}>
                <f.i className="mb-2 h-4 w-4 text-[hsl(243_90%_78%)]" strokeWidth={1.6} />
                <div className="font-medium">{f.t}</div>
                <div className="text-xs text-white/50">{f.d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-sm rise">
            <div className="mb-8 lg:hidden"><Logo /></div>
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">Care team and patients sign in with email and password.</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="Work email">
                <input type="email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-email" />
              </Field>
              <Field label="Password">
                <input type="password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="input-password" />
              </Field>
              {error && <div className="rounded-md border border-destructive/25 bg-[hsl(356_80%_98%)] px-3 py-2 text-xs text-destructive" data-testid="text-login-error">{error}</div>}
              <Btn type="submit" variant="primary" className="w-full" disabled={login.isPending} data-testid="button-login">
                {login.isPending ? "Signing in…" : <>Sign in <ArrowRight className="h-4 w-4" /></>}
              </Btn>
            </form>

            <div className="mt-6 rounded-lg border border-dashed border-primary/30 bg-accent/60 p-4" data-testid="card-demo-credentials">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-foreground">Synthetic demo credentials</span>
              {[
                { who: "Staff", sub: "Care team workspace", email: DEMO_EMAIL },
                { who: "Patient", sub: "Patient app, own record only", email: PATIENT_EMAIL },
              ].map((c) => (
                <div key={c.who} className="mt-3 flex items-center gap-3 border-t border-primary/15 pt-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{c.who} <span className="font-normal text-muted-foreground">· {c.sub}</span></div>
                    <div className="truncate font-mono text-[11px]">{c.email}</div>
                  </div>
                  <button type="button" className="rounded-md border border-primary/30 bg-card px-2.5 py-1 text-xs font-medium text-primary hover:bg-accent" onClick={() => { setEmail(c.email); setPassword(DEMO_PASS); }} data-testid={`button-fill-${c.who.toLowerCase()}`}>Use {c.who.toLowerCase()}</button>
                </div>
              ))}
              <div className="mt-3 font-mono text-[11px] text-muted-foreground">Password for both: <span className="text-foreground">{DEMO_PASS}</span></div>
            </div>

            <div className="mt-6 flex items-center gap-2 text-[11px] text-muted-foreground" data-testid="status-api">
              <span className={`h-1.5 w-1.5 rounded-full ${health.isSuccess ? "bg-[hsl(162_60%_40%)]" : health.isError ? "bg-destructive" : "bg-muted-foreground pulse-dot"}`} />
              {health.isSuccess ? `Service ${health.data.status}` : health.isError ? "Service unreachable" : "Checking service"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
