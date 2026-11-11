import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, users } from "@workspace/db";
import { CreateAccountBody, UpdateAccountBody, UpdateAccountParams, IssueAccountInvitationParams, ListAccountsResponse, CreateAccountResponse, UpdateAccountResponse } from "@workspace/api-zod";
import { accountView, issueInvitation, protectLastAdministrator, revokeUserSessions } from "../lib/account-security";
import { allRecords, getPatientRow, id, writeAudit, type Actor } from "../lib/store";
import { hashPassword } from "../lib/passwords";
import { randomBytes } from "node:crypto";
import { AppError, requireValue } from "../lib/errors";

export const accountsRouter=Router();
async function checkLocations(scopes:string[]) {
  const known=(await allRecords(db,"locations")).filter(r=>r.status==="active").map(r=>r.title);
  if (scopes.some(x=>!known.includes(x))) throw new AppError(400,"Select active locations from this practice");
}
accountsRouter.get("/accounts",async (_req,res):Promise<void>=>{
  res.json(ListAccountsResponse.parse((await db.select().from(users).orderBy(users.name)).map(accountView)));
});
accountsRouter.post("/accounts",async (req,res):Promise<void>=>{
  const input=CreateAccountBody.parse(req.body), actor=res.locals.actor as Actor;
  await checkLocations(input.locationScopes);
  if (!input.name.trim()) throw new AppError(400,"Name is required");
  if (input.role==="patient") {
    if (!input.patientId) throw new AppError(400,"Link the patient account to a patient");
    await getPatientRow(db,input.patientId);
  } else if (input.patientId) throw new AppError(400,"Staff accounts cannot be linked as patients");
  const email=input.email.trim().toLowerCase();
  const passwordHash=await hashPassword(randomBytes(48).toString("hex"));
  const result=await db.transaction(async s=>{
    const inserted=await s.insert(users).values({...input,id:id(),email,name:input.name.trim(),patientId:input.role==="patient"?input.patientId:null,status:"invited",passwordHash}).onConflictDoNothing({target:users.email}).returning();
    if (!inserted[0]) throw new AppError(409,"An account with this email already exists");
    await writeAudit(s,actor,"create_account",inserted[0].id,input.patientId,{role:input.role,locationScopes:input.locationScopes});
    return issueInvitation(s,inserted[0],actor);
  });
  res.status(201).json(CreateAccountResponse.parse(result));
});
accountsRouter.patch("/accounts/:accountId",async (req,res):Promise<void>=>{
  const {accountId}=UpdateAccountParams.parse(req.params),input=UpdateAccountBody.parse(req.body),actor=res.locals.actor as Actor;
  if (input.name!==undefined&&!input.name.trim()) throw new AppError(400,"Name is required");
  if (input.locationScopes) await checkLocations(input.locationScopes);
  const result=await db.transaction(async s=>{
    // Same lock ordering as last-admin protection to make concurrent changes deterministic.
    const {sql}=await import("drizzle-orm");await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    const [old]=await s.select().from(users).where(eq(users.id,accountId)).for("update");
    const u=requireValue(old,"Account not found");
    if (input.role && (input.role==="patient")!==(u.role==="patient")) throw new AppError(400,"Patient and staff identities cannot be converted into each other");
    if (u.status==="invited"&&input.status==="active") throw new AppError(400,"The invited user must set a password before activation");
    await protectLastAdministrator(s,u,input.role??u.role,input.status??u.status);
    const [updated]=await s.update(users).set({...input,name:input.name?.trim()??u.name}).where(eq(users.id,accountId)).returning();
    await revokeUserSessions(s,accountId);
    await writeAudit(s,actor,"update_account_access",accountId,u.patientId,{role:updated!.role,status:updated!.status,locationScopes:updated!.locationScopes});
    return accountView(updated!);
  });
  res.json(UpdateAccountResponse.parse(result));
});
accountsRouter.post("/accounts/:accountId/invitation",async (req,res):Promise<void>=>{
  const {accountId}=IssueAccountInvitationParams.parse(req.params);
  const result=await db.transaction(async s=>{
    const [u]=await s.select().from(users).where(eq(users.id,accountId)).for("update");
    return issueInvitation(s,requireValue(u,"Account not found"),res.locals.actor as Actor);
  });
  res.json(CreateAccountResponse.parse(result));
});
