import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, passwordTokens, sessions, users } from "@workspace/db";
import { permissionsFor } from "./access";
import { writeAudit, type Actor, type Store } from "./store";
import { AppError } from "./errors";
import {staffContext,canUseEmergencyAccess} from "./staff-identity";

export const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export const sessionReference = (tokenHash: string) => digest(`session-reference:${tokenHash}`);
export const safeUser = (u: typeof users.$inferSelect,location?:string|null): Actor => {
  const context=staffContext(u,location);
  return {id:u.id,email:u.email,name:u.name,role:context.role,credential:u.credential,patientId:u.patientId,
    locationScopes:context.locationScopes,permissions:permissionsFor(context.role),siteRoles:u.siteRoles,activeLocation:context.activeLocation,baseRole:u.role,npi:u.npi,canUseEmergencyAccess:canUseEmergencyAccess(u)};
};
export const accountView = (u: typeof users.$inferSelect) => ({
  ...safeUser(u),role:u.role,locationScopes:u.locationScopes,permissions:permissionsFor(u.role),activeLocation:null,status: u.status, createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null, lockedUntil: u.lockedUntil?.toISOString() ?? null,
});
export function checkPassword(password: string) {
  if (password.length < 12 || password.length > 128 || !/\S/.test(password)) throw new AppError(400, "Use a password with 12 to 128 characters");
}
export async function issueInvitation(s: Store, u: typeof users.$inferSelect, actor: Actor) {
  if (u.status === "inactive") throw new AppError(409, "Reactivate this account before issuing a link");
  const token = randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  // Only hashes persist. Plaintext tokens are returned once to the authorized administrator.
  await s.update(passwordTokens).set({usedAt:new Date()}).where(and(eq(passwordTokens.userId,u.id),isNull(passwordTokens.usedAt)));
  await s.insert(passwordTokens).values({tokenHash:digest(token),userId:u.id,purpose:u.status==="invited"?"invite":"reset",expiresAt});
  await writeAudit(s, actor, "issue_account_link", u.id, u.patientId);
  return {account:accountView(u),path:`/reset-password?token=${token}`,expiresAt:expiresAt.toISOString(),delivery:"Local handoff only. No email was sent."};
}
export async function protectLastAdministrator(s: Store, old: typeof users.$inferSelect, role: string, status: string) {
  await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
  if (old.role === "admin" && old.status === "active" && (role !== "admin" || status !== "active")) {
    const admins = await s.select({id:users.id}).from(users).where(and(eq(users.role,"admin"),eq(users.status,"active")));
    if (admins.length <= 1) throw new AppError(409,"The last active administrator cannot be deactivated or demoted");
  }
}
export async function revokeUserSessions(s: Store, userId: string) {
  await s.delete(sessions).where(eq(sessions.userId,userId));
}
