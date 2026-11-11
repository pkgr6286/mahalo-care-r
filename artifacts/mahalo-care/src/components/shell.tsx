import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, ClipboardList, Gauge, UserCog, CreditCard, Layers, LogOut, Menu, MessageSquare, Router, Settings2, Smartphone, Sun, Users, X,
} from "lucide-react";
import { useGetCurrentUser, getGetCurrentUserQueryKey, useGetSettings, useLogout, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { initials, isUnauthorized } from "@/lib/api";
import { ErrorState } from "@/components/kit";
import { PatientApp } from "@/pages/patient-app";
import { Logo } from "@/components/brand";
import { can } from "@/components/access";
import { GlobalTimer } from "@/components/global-timer";
import { CommandPalette, SearchTrigger } from "@/components/command-palette";
import { usePrefs } from "@/hooks/use-workspace-prefs";
import { CaregiverPortal } from "@/pages/caregiver";
import { SessionLockGuard, setSessionLocked } from "@/components/session-lock";
import { LocationContextSwitcher } from "@/components/location-context";
import { EmergencyAccessAction, EmergencyBanner, emergencyOf, purgeContext } from "@/components/emergency-access";
import { onContextChange } from "@/lib/context-sync";
import { roleLabel } from "@/pages/account";
export { Logo, Mark } from "@/components/brand";

export function SyntheticRibbon() {
  return (
    <div className="relative z-40 flex h-7 items-center justify-center gap-2 border-b border-border bg-[hsl(var(--brand-charcoal))] px-3 text-[11px] text-[hsl(40_12%_80%)]" data-testid="banner-synthetic">
      <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.14em] text-[hsl(var(--background))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand-orange))]" />Synthetic data</span>
      <span className="truncate">Synthetic patients only. Do not enter real patient information.</span>
    </div>
  );
}

const NAV: { href: string; label: string; icon: typeof Sun; perms?: string[] }[] = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/worklists", label: "Worklists", icon: ClipboardList, perms: ["admin", "clinical.read", "devices.write"] },
  { href: "/patients", label: "Patients", icon: Users, perms: ["patients.read"] },
  { href: "/programs", label: "Programs", icon: Layers },
  { href: "/rules", label: "Rules", icon: Gauge, perms: ["admin", "clinical.read"] },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/devices", label: "Devices", icon: Router },
  { href: "/billing", label: "Billing", icon: CreditCard, perms: ["billing.read"] },
  { href: "/reports", label: "Reports", icon: BarChart3, perms: ["clinical.read", "billing.read"] },
  { href: "/admin", label: "Admin", icon: Settings2, perms: ["admin"] },
  { href: "/patient", label: "Patient app", icon: Smartphone, perms: ["admin", "clinical.write"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const me = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey(), refetchInterval:60_000, refetchOnWindowFocus:true } });
  const isPatient = me.data?.role === "patient";
  const isCaregiver = (me.data?.role as string | undefined) === "caregiver";
  const settings = useGetSettings({ query: { enabled: !!me.data && !isPatient && !isCaregiver, queryKey: getGetSettingsQueryKey() } });
  const logout = useLogout();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = () => { setOpen(false); setSearchOpen(true); };
  const prefs = usePrefs();
  const density = prefs.q.data?.density === "compact" ? "compact" : "comfortable";

  useEffect(() => setOpen(false), [location]);
  const myId = me.data?.id;
  useEffect(() => {
    if (!myId) return;
    return onContextChange(myId, () => { void purgeContext(qc).then(() => qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() })); setLocation("/"); });
  }, [myId, qc, setLocation]);
  useEffect(() => {
    if (me.isError && isUnauthorized(me.error)) {qc.clear();setLocation("/login");}
  }, [me.isError, me.error, setLocation, qc]);
  useEffect(() => {
    if (isPatient && location !== "/patient" && location !== "/account") setLocation("/patient");
  }, [isPatient, location, setLocation]);
  useEffect(() => {
    if (isCaregiver && location !== "/caregiver" && location !== "/account") setLocation("/caregiver");
  }, [isCaregiver, location, setLocation]);

  if (me.isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="fade-in flex flex-col items-center gap-5">
          <Logo height={32} />
          <div className="h-[3px] w-40 overflow-hidden rounded-full bg-muted"><div className="load-bar h-full w-1/2 rounded-full brand-rule" /></div>
        </div>
      </div>
    );
  }
  if (me.isError) {
    if (isUnauthorized(me.error)) return null;
    return <div className="p-10"><ErrorState error={me.error} onRetry={() => me.refetch()} /></div>;
  }
  const user = me.data!;
  const doLogout = () => {
    setSessionLocked(false);
    logout.mutate(undefined, {
      onSettled: () => {
        qc.clear();
        setLocation("/login");
      },
    });
  };

  if ((user.role as string) === "caregiver") {
    if (location === "/account") {
      return (
        <div className="min-h-[100dvh] bg-background">
          <div className="flex items-center justify-between border-b border-border px-5 py-3"><Link href="/caregiver" aria-label="Back to shared care"><Logo /></Link></div>
          {children}
        </div>
      );
    }
    return <CaregiverPortal name={user.name} onSignOut={doLogout} signingOut={logout.isPending} />;
  }
  if (user.role === "patient") {
    if (location === "/account") {
      return (
        <div className="min-h-[100dvh] bg-background">
          <SyntheticRibbon />
          <div className="flex items-center justify-between border-b border-border px-5 py-3"><Link href="/patient" aria-label="Back to my care"><Logo /></Link></div>
          {children}
        </div>
      );
    }
    return (
      <div className="min-h-[100dvh] bg-background">
        <SyntheticRibbon />
        {user.patientId ? (
          <PatientApp id={user.patientId} mode="patient" onSignOut={doLogout} signingOut={logout.isPending} />
        ) : (
          <div className="p-6"><ErrorState error={new Error("This account is not linked to a patient record.")} /></div>
        )}
        {!user.patientId && <div className="px-6"><button onClick={doLogout} className="text-sm font-medium text-primary underline-offset-4 hover:underline" data-testid="button-patient-signout">Sign out</button></div>}
      </div>
    );
  }
  const isActive = (href: string) => (href === "/" ? location === "/" : location.startsWith(href));

  const sidebar = (
    <aside className="flex h-full w-[248px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-[72px] items-center justify-between px-5">
        <Logo />
        <button className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary md:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-4 w-4" /></button>
      </div>
      <div className="mx-3 mb-4 rounded-xl border border-sidebar-border bg-card px-3 py-2.5">
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Practice</div>
        <div className="mt-0.5 truncate font-serif text-[15px] text-foreground" data-testid="text-practice-name">{settings.data?.name ?? "Loading…"}</div>
      </div>
      {!emergencyOf(user) && <LocationContextSwitcher user={user} />}
      <div className="mx-3 mb-3"><SearchTrigger onOpen={openSearch} /></div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Primary">
        {NAV.filter((n) => !n.perms || can(user, ...n.perms)).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            data-testid={`link-nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-[background-color,color] duration-200",
              isActive(n.href) ? "bg-card font-medium text-foreground shadow-[var(--shadow-sm)] ring-1 ring-sidebar-border" : "text-foreground/65 hover:bg-[hsl(40_15%_92%)] hover:text-foreground",
              n.href === "/patient" && "mt-5",
            )}
          >
            {isActive(n.href) && <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-[hsl(var(--brand-orange))]" />}
            <n.icon className={cn("h-[17px] w-[17px] transition-colors", isActive(n.href) ? "text-[hsl(var(--primary))]" : "text-foreground/50 group-hover:text-foreground/80")} strokeWidth={1.5} />
            {n.label}
          </Link>
        ))}
      </nav>
      <EmergencyAccessAction user={user} />
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--brand-orange))]/40 bg-accent text-[11px] font-semibold text-accent-foreground">{initials(user.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-foreground" data-testid="text-user-name">{user.name}{user.credential ? `, ${user.credential}` : ""}</div>
            <div className="truncate text-[11px] text-muted-foreground">{roleLabel(user.role)}</div>
          </div>
          <Link href="/account" className={cn("rounded-full p-2 transition-colors hover:bg-[hsl(40_15%_92%)] hover:text-foreground", isActive("/account") ? "text-primary" : "text-muted-foreground")} aria-label="Account and security" title="Account and security" data-testid="link-nav-account">
            <UserCog className="h-4 w-4" strokeWidth={1.6} />
          </Link>
          <button onClick={doLogout} disabled={logout.isPending} className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-[hsl(40_15%_92%)] hover:text-foreground" aria-label="Sign out" title="Sign out" data-testid="button-logout">
            <LogOut className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-[100dvh] flex-col" data-density={density}>
      <SessionLockGuard enabled serverLocked={(user as { sessionLocked?: boolean }).sessionLocked === true} onSignOut={doLogout} />
      <SyntheticRibbon />
      <div className="flex flex-1">
        <div className="sticky top-0 hidden h-[calc(100dvh-28px)] md:block">{sidebar}</div>
        {open && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="fade-in absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
            <div className="sheet-in relative h-full w-fit shadow-[var(--shadow-lg)]">{sidebar}</div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-30">
          <div className="flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-full p-1.5 hover:bg-secondary" data-testid="button-menu"><Menu className="h-5 w-5" strokeWidth={1.5} /></button>
            <Logo />
            <SearchTrigger onOpen={openSearch} compact />
          </div>
          <EmergencyBanner user={user} />
          </div>
          <CommandPalette user={user} nav={NAV} open={searchOpen} onOpenChange={(next) => { if(next) openSearch(); else setSearchOpen(false); }} />
          <GlobalTimer user={user} />
          <main key={location.split("/")[1]} className="mx-auto w-full max-w-[1320px] px-4 py-6 md:px-10 md:py-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
