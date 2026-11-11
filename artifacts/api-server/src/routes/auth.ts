import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { db, users, sessions, passwordTokens } from "@workspace/db";
import { LoginBody, LoginResponse, RequestPasswordResetBody, ResetPasswordBody, ChangePasswordBody, RevokeSessionParams, ListSessionsResponse } from "@workspace/api-zod";
import { hashPassword, verifyPassword } from "../lib/passwords";
import { addRecord, writeAudit, type Actor } from "../lib/store";
import { checkPassword, digest, revokeUserSessions, safeUser, sessionReference } from "../lib/account-security";
import { AppError } from "../lib/errors";

export const authRouter = Router();
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: "draft-8", legacyHeaders: false, validate: { xForwardedForHeader: false } });
const recoveryLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false, validate: { xForwardedForHeader: false } });
// Distinct invitations behind one practice/NAT must not consume a shared eight-reset budget.
// Keep a bounded IP budget as well as a tight per-token budget; token values never appear in logs.
const resetIpLimit = rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:"draft-8",legacyHeaders:false,validate:{xForwardedForHeader:false}});
const resetTokenLimit = rateLimit({windowMs:15*60*1000,limit:5,keyGenerator:req=>digest(String(req.body?.token??"").slice(0,128)),standardHeaders:"draft-8",legacyHeaders:false});
const cookieOptions = (req: Request) => ({ httpOnly:true, secure:req.secure, sameSite:"lax" as const, path:"/" });
const system: Actor = {id:"system",name:"Account recovery",role:"admin",credential:"admin",email:"system@example.test"};
// Equal-cost password verification for unknown users prevents an obvious account-enumeration timing path.
const dummyHash = hashPassword(randomBytes(32).toString("hex"));

authRouter.post("/auth/login", authLimit, async (req, res): Promise<void> => {
  const { email, password } = LoginBody.parse(req.body);
  if (password.length > 128) throw new AppError(401,"Email or password is incorrect");
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  const valid = await verifyPassword(password, u?.passwordHash ?? await dummyHash);
  const locked = !!u?.lockedUntil && u.lockedUntil.getTime() > Date.now();
  if (!u || u.status !== "active" || !valid || locked) {
    if (u && !locked && u.status === "active") {
      await db.update(users).set({
        failedAttempts:sql`case when ${users.lockedUntil} is not null and ${users.lockedUntil} <= now() then 1 else ${users.failedAttempts} + 1 end`,
        lockedUntil:sql`case when ${users.lockedUntil} is not null and ${users.lockedUntil} <= now() then null when ${users.failedAttempts} + 1 >= 5 then now() + interval '15 minutes' else null end`,
      }).where(eq(users.id,u.id));
      await writeAudit(db,safeUser(u),"login_failed",u.id);
    }
    res.status(401).json({ error: "Email or password is incorrect, or sign-in is temporarily unavailable" }); return;
  }
  const token = randomBytes(32).toString("hex");
  await db.transaction(async s => {
    const [current] = await s.select().from(users).where(eq(users.id,u.id)).for("update");
    if (!current || current.status !== "active" || current.passwordHash !== u.passwordHash || current.lockedUntil && current.lockedUntil.getTime()>Date.now()) throw new AppError(401,"Sign-in is unavailable");
    await s.insert(sessions).values({ tokenHash: digest(token), userId: u.id, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    await s.update(users).set({lastLoginAt:new Date(),failedAttempts:0,lockedUntil:null}).where(eq(users.id,u.id));
    await writeAudit(s, safeUser(current), "login", u.id);
  });
  res.cookie("mahalo_session", token, {...cookieOptions(req),maxAge:24*60*60*1000});
  res.cookie("mahalo_csrf", randomBytes(24).toString("hex"), { ...cookieOptions(req), httpOnly:false, maxAge:24*60*60*1000 });
  res.json(LoginResponse.parse(safeUser(u)));
});

authRouter.post("/auth/password/request", recoveryLimit, async (req,res): Promise<void> => {
  const {email} = RequestPasswordResetBody.parse(req.body);
  const [u] = await db.select().from(users).where(eq(users.email,email.trim().toLowerCase()));
  if (u && u.status !== "inactive") {
    // The local adapter has no outbound email. Queue a generic staff handoff task, never log/store a reset token.
    await addRecord(db,"notifications",{
      title:"Account recovery requested",status:"captured",description:"Local delivery only. An administrator must issue a one-time recovery link from Accounts.",
      metadata:{accountId:u.id,driver:"console",channel:"email",containsClinicalContent:false},
    },system);
    await writeAudit(db,system,"request_password_recovery",u.id);
  }
  res.json({success:true,message:"If an account exists, recovery has been requested. In this local demo, ask a practice administrator for the one-time recovery link."});
});

authRouter.post("/auth/password/reset", resetIpLimit, resetTokenLimit, async (req,res): Promise<void> => {
  const input=ResetPasswordBody.parse(req.body); checkPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  await db.transaction(async s => {
    const [t] = await s.select().from(passwordTokens).where(and(eq(passwordTokens.tokenHash,digest(input.token)),isNull(passwordTokens.usedAt),gt(passwordTokens.expiresAt,new Date()))).for("update");
    if (!t) throw new AppError(400,"This link is invalid, expired or already used. Request a new link.");
    const [u] = await s.select().from(users).where(eq(users.id,t.userId)).for("update");
    if (!u || u.status === "inactive") throw new AppError(400,"This account is not available");
    await s.update(users).set({passwordHash,status:"active",failedAttempts:0,lockedUntil:null}).where(eq(users.id,u.id));
    await s.update(passwordTokens).set({usedAt:new Date()}).where(and(eq(passwordTokens.userId,u.id),isNull(passwordTokens.usedAt)));
    await revokeUserSessions(s,u.id);
    await writeAudit(s,safeUser(u),"reset_password",u.id);
  });
  res.clearCookie("mahalo_session",{path:"/"});res.clearCookie("mahalo_csrf",{path:"/"});
  res.json({success:true,message:"Password saved. Sign in with your new password."});
});

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.mahalo_session;
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) { res.status(401).json({ error: "Sign in to continue" }); return; }
  const [row] = await db.select({user:users,session:sessions}).from(sessions).innerJoin(users,eq(sessions.userId,users.id))
    .where(and(eq(sessions.tokenHash,digest(token)),gt(sessions.expiresAt,new Date()),gt(sessions.lastSeenAt,new Date(Date.now()-12*60*60*1000)),eq(users.status,"active")));
  if (!row) { res.status(401).json({ error: "Your session has expired. Sign in again." }); return; }
  // Browser requests require a same-origin CSRF proof; non-browser API clients use the session cookie directly.
  if (!["GET","HEAD","OPTIONS"].includes(req.method) && (req.get("origin") || req.get("sec-fetch-site"))) {
    if (!req.cookies.mahalo_csrf || req.get("x-csrf-token") !== req.cookies.mahalo_csrf) throw new AppError(403,"Refresh the page before trying again");
  }
  if (!req.cookies.mahalo_csrf) res.cookie("mahalo_csrf",randomBytes(24).toString("hex"),{...cookieOptions(req),httpOnly:false,maxAge:24*60*60*1000});
  if (Date.now()-row.session.lastSeenAt.getTime()>60_000) await db.update(sessions).set({lastSeenAt:new Date()}).where(eq(sessions.tokenHash,row.session.tokenHash));
  res.locals.actor=safeUser(row.user);res.locals.sessionHash=row.session.tokenHash;
  next();
}

export const sessionRouter = Router();
sessionRouter.get("/auth/me", (_req,res) => {res.json(res.locals.actor);});
sessionRouter.post("/auth/logout", async (_req,res): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.tokenHash,res.locals.sessionHash));
  await writeAudit(db,res.locals.actor as Actor,"logout",(res.locals.actor as Actor).id);
  res.clearCookie("mahalo_session",{path:"/"});res.clearCookie("mahalo_csrf",{path:"/"});
  res.json({success:true,message:"Signed out"});
});
sessionRouter.get("/auth/sessions",async (_req,res): Promise<void> => {
  const rows=await db.select().from(sessions).where(and(eq(sessions.userId,(res.locals.actor as Actor).id),gt(sessions.expiresAt,new Date()),gt(sessions.lastSeenAt,new Date(Date.now()-12*60*60*1000))));
  res.json(ListSessionsResponse.parse(rows.map(s=>({id:sessionReference(s.tokenHash),createdAt:s.createdAt.toISOString(),lastSeenAt:s.lastSeenAt.toISOString(),expiresAt:s.expiresAt.toISOString(),current:s.tokenHash===res.locals.sessionHash}))));
});
sessionRouter.post("/auth/sessions/:sessionId/revoke",async (req,res): Promise<void> => {
  const {sessionId}=RevokeSessionParams.parse(req.params), actor=res.locals.actor as Actor;
  const rows=await db.select().from(sessions).where(eq(sessions.userId,actor.id));
  const row=rows.find(s=>sessionReference(s.tokenHash)===sessionId);
  if (!row) throw new AppError(404,"Session not found");
  await db.delete(sessions).where(and(eq(sessions.tokenHash,row.tokenHash),eq(sessions.userId,actor.id)));
  await writeAudit(db,actor,"revoke_session",actor.id);
  if (row.tokenHash===res.locals.sessionHash) {res.clearCookie("mahalo_session",{path:"/"});res.clearCookie("mahalo_csrf",{path:"/"});}
  res.json({success:true,message:"Session revoked"});
});
sessionRouter.post("/auth/password/change",async (req,res): Promise<void> => {
  const input=ChangePasswordBody.parse(req.body),actor=res.locals.actor as Actor;
  checkPassword(input.password);
  await db.transaction(async s=>{
    const [u]=await s.select().from(users).where(eq(users.id,actor.id)).for("update");
    if (!u || !await verifyPassword(input.currentPassword,u.passwordHash)) throw new AppError(400,"Current password is incorrect");
    await s.update(users).set({passwordHash:await hashPassword(input.password),failedAttempts:0,lockedUntil:null}).where(eq(users.id,u.id));
    await revokeUserSessions(s,u.id);
    await s.update(passwordTokens).set({usedAt:new Date()}).where(and(eq(passwordTokens.userId,u.id),isNull(passwordTokens.usedAt)));
    await writeAudit(s,actor,"change_password",u.id);
  });
  res.clearCookie("mahalo_session",{path:"/"});res.clearCookie("mahalo_csrf",{path:"/"});
  res.json({success:true,message:"Password changed. All sessions were signed out."});
});
