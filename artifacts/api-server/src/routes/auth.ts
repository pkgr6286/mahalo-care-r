import { Router, type Request, type Response, type NextFunction } from "express";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { db, users, sessions } from "@workspace/db";
import { LoginBody, LoginResponse } from "@workspace/api-zod";
import { verifyPassword } from "../lib/passwords";
import { writeAudit, type Actor } from "../lib/store";

export const authRouter = Router();
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const safeUser = (u: typeof users.$inferSelect): Actor => ({ id: u.id, email: u.email, name: u.name, role: u.role, credential: u.credential, patientId:u.patientId });
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, validate: { xForwardedForHeader: false } });

authRouter.post("/auth/login", loginLimit, async (req, res): Promise<void> => {
  const { email, password } = LoginBody.parse(req.body);
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  if (!u || u.status !== "active" || !await verifyPassword(password, u.passwordHash)) {
    res.status(401).json({ error: "Email or password is incorrect" }); return;
  }
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ tokenHash: digest(token), userId: u.id, expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000) });
  res.cookie("mahalo_session", token, { httpOnly: true, secure: req.secure, sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 * 1000 });
  await writeAudit(db, safeUser(u), "login", u.id);
  res.json(LoginResponse.parse(safeUser(u)));
});

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.mahalo_session;
  if (typeof token !== "string" || token.length !== 64) { res.status(401).json({ error: "Sign in to continue" }); return; }
  const [row] = await db.select({ user: users }).from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, digest(token)), gt(sessions.expiresAt, new Date()), eq(users.status, "active")));
  if (!row) { res.status(401).json({ error: "Your session has expired. Sign in again." }); return; }
  res.locals.actor = safeUser(row.user);
  next();
}

export const sessionRouter = Router();
sessionRouter.get("/auth/me", (_req, res) => { res.json(res.locals.actor); });
sessionRouter.post("/auth/logout", async (req, res): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.tokenHash, digest(req.cookies.mahalo_session)));
  res.clearCookie("mahalo_session", { path: "/" });
  res.json({ success: true, message: "Signed out" });
});
