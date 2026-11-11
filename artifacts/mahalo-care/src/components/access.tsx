import type { ReactNode } from "react";
import { Link } from "wouter";
import { Lock } from "lucide-react";
import { useGetCurrentUser, getGetCurrentUserQueryKey, type User } from "@workspace/api-client-react";

export const can = (u: User | undefined, ...perms: string[]) => !!u && perms.some((p) => (u.permissions ?? []).includes(p));

export function RequirePermission({ any, area, children }: { any: string[]; area: string; children: ReactNode }) {
  const me = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  if (!me.data) return null;
  if (can(me.data, ...any)) return <>{children}</>;
  return (
    <div className="rise mx-auto mt-10 max-w-md rounded-2xl border border-card-border bg-card p-8 text-center shadow-[var(--shadow)]" data-testid="state-access-denied">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary text-[hsl(var(--brand-orange))]"><Lock className="h-4 w-4" strokeWidth={1.6} /></div>
      <h1 className="mt-4 text-2xl">{area} isn't part of your access</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your account role doesn't include this area. If you need it for your work, ask a practice administrator to update your role.</p>
      <Link href="/" className="mt-5 inline-flex h-9 items-center rounded-full border border-input bg-card px-4 text-sm font-medium hover:bg-secondary" data-testid="link-denied-home">Back to Today</Link>
    </div>
  );
}

/** Current-user permission check with admin bypass. Backend still enforces; this only hides misleading controls. */
export function usePermission() {
  const me = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const u = me.data;
  return { user: u, allow: (...perms: string[]) => can(u, "admin", ...perms) };
}
export function PermissionOnly({ any, children, fallback = null }: { any: string[]; children: ReactNode; fallback?: ReactNode }) {
  const { allow } = usePermission();
  return <>{allow(...any) ? children : fallback}</>;
}
/** Small, readable note shown where write controls are hidden. */
export function ReadOnlyHint({ text = "Read only" }: { text?: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground" data-testid="hint-read-only"><Lock className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />{text}</span>;
}
