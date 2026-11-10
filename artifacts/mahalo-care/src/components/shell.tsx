import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity, BarChart3, ClipboardList, CreditCard, Layers, LogOut, Menu, MessageSquare, Router, Settings2, Smartphone, Sun, Users, X,
} from "lucide-react";
import { useGetCurrentUser, getGetCurrentUserQueryKey, useGetSettings, useLogout, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { initials, isUnauthorized } from "@/lib/api";
import { ErrorState } from "@/components/kit";
import { PatientApp } from "@/pages/patient-app";

export function SyntheticRibbon() {
  return (
    <div className="relative z-40 flex h-7 items-center justify-center gap-2 bg-[repeating-linear-gradient(135deg,hsl(243_79%_56%)_0_10px,hsl(243_79%_52%)_10px_20px)] px-3 text-[11px] font-medium tracking-wide text-white" data-testid="banner-synthetic">
      <span className="rounded-sm bg-white/15 px-1.5 font-semibold uppercase tracking-[0.12em]">Synthetic data</span>
      <span className="truncate">Demo environment. No real patient information. EHR, video and notifications are simulated; optional live AI drafts use synthetic charts only.</span>
    </div>
  );
}

const NAV = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/worklists", label: "Worklists", icon: ClipboardList },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/programs", label: "Programs", icon: Layers },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/devices", label: "Devices", icon: Router },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin", label: "Admin", icon: Settings2 },
  { href: "/patient", label: "Patient app", icon: Smartphone },
];

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
        <rect x="0.75" y="0.75" width="24.5" height="24.5" rx="7" stroke={light ? "rgba(255,255,255,.35)" : "hsl(243 79% 56% / .35)"} strokeWidth="1.5" />
        <path d="M6 15.5c2.2 0 2.6-5 4.6-5s2.2 6 4.4 6 2.4-4 4.6-4" stroke={light ? "#fff" : "hsl(243 79% 56%)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={cn("text-[15px] font-semibold tracking-tight", light ? "text-white" : "text-foreground")}>
        Mahalo<span className={light ? "text-[hsl(243_90%_78%)]" : "text-primary"}> Care</span>
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const me = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const isPatient = me.data?.role === "patient";
  const settings = useGetSettings({ query: { enabled: !!me.data && !isPatient, queryKey: getGetSettingsQueryKey() } });
  const logout = useLogout();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [location]);
  useEffect(() => {
    if (me.isError && isUnauthorized(me.error)) setLocation("/login");
  }, [me.isError, me.error, setLocation]);
  useEffect(() => {
    if (isPatient && location !== "/patient") setLocation("/patient");
  }, [isPatient, location, setLocation]);

  if (me.isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Logo />
          <div className="h-0.5 w-32 overflow-hidden rounded bg-muted"><div className="h-full w-1/2 animate-pulse bg-primary" /></div>
        </div>
      </div>
    );
  }
  if (me.isError) {
    if (isUnauthorized(me.error)) return null;
    return <div className="p-10"><ErrorState error={me.error} onRetry={() => me.refetch()} /></div>;
  }
  const user = me.data!;
  const doLogout = () =>
    logout.mutate(undefined, {
      onSettled: () => {
        qc.clear();
        setLocation("/login");
      },
    });

  if (user.role === "patient") {
    return (
      <div className="min-h-[100dvh] bg-background">
        <SyntheticRibbon />
        {user.patientId ? (
          <PatientApp id={user.patientId} mode="patient" onSignOut={doLogout} signingOut={logout.isPending} />
        ) : (
          <div className="p-6"><ErrorState error={new Error("This account is not linked to a patient record.")} /></div>
        )}
        {!user.patientId && <div className="px-6"><button onClick={doLogout} className="text-sm font-medium text-primary" data-testid="button-patient-signout">Sign out</button></div>}
      </div>
    );
  }
  const isActive = (href: string) => (href === "/" ? location === "/" : location.startsWith(href));

  const sidebar = (
    <aside className="flex h-full w-[232px] flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center justify-between px-4">
        <Logo light />
        <button className="md:hidden text-white/70" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-4 w-4" /></button>
      </div>
      <div className="px-4 pb-3">
        <div className="truncate text-[11px] uppercase tracking-[0.14em] text-white/40">Practice</div>
        <div className="truncate text-[13px] font-medium text-white" data-testid="text-practice-name">{settings.data?.name ?? "Loading…"}</div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {NAV.map((n, i) => (
          <Link
            key={n.href}
            href={n.href}
            data-testid={`link-nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
              isActive(n.href) ? "bg-sidebar-accent text-white" : "text-white/65 hover:bg-white/5 hover:text-white",
              i === 9 && "mt-4",
            )}
          >
            {isActive(n.href) && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-[hsl(243_90%_72%)]" />}
            <n.icon className="h-4 w-4" strokeWidth={1.6} />
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(243_79%_56%)] text-[11px] font-semibold text-white">{initials(user.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-white" data-testid="text-user-name">{user.name}{user.credential ? `, ${user.credential}` : ""}</div>
            <div className="truncate text-[11px] text-white/50">{user.role}</div>
          </div>
          <button onClick={doLogout} disabled={logout.isPending} className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out" data-testid="button-logout">
            <LogOut className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SyntheticRibbon />
      <div className="flex flex-1">
        <div className="sticky top-0 hidden h-[calc(100dvh-28px)] md:block">{sidebar}</div>
        {open && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
            <div className="relative h-full w-fit">{sidebar}</div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:hidden">
            <button onClick={() => setOpen(true)} aria-label="Open menu" data-testid="button-menu"><Menu className="h-5 w-5" /></button>
            <Logo />
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <main key={location.split("/")[1]} className="mx-auto w-full max-w-[1320px] px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
