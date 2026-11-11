import { and,eq,sql } from "drizzle-orm";
import { z } from "zod";
import { db,caregiverGrants,patientContacts,records,users,type CaregiverGrantRow } from "@workspace/db";
import { addRecord,getPatientRow,patchRecord,getRecord,writeAudit,id,type Actor,type Store } from "./store";
import { authorize,assertPatientAccess } from "./access";
import { captureDocuments } from "./document-store";
import { AppError,requireValue } from "./errors";

export const caregiverScopes=["careplans.read","readings.read","tasks.read","messages.read","messages.send","education.read","appointments.read"] as const;
const inputSchema=z.object({
  contactId:z.string().min(1),userId:z.string().min(1),scopes:z.array(z.enum(caregiverScopes)).min(1).max(7),
  method:z.enum(["verbal","written"]),consentText:z.string().trim().min(20).max(4000),attested:z.literal(true),
  expiresAt:z.string().datetime({offset:true}).optional(),
});
export async function caregiverRows(s:Store,patientId?:string,userId?:string) {
  return s.select({grant:caregiverGrants,contact:patientContacts,user:users,consentStatus:records.status,consentKind:records.kind,consentMetadata:records.metadata}).from(caregiverGrants)
    .innerJoin(users,eq(users.id,caregiverGrants.userId))
    .leftJoin(patientContacts,and(eq(patientContacts.id,caregiverGrants.contactId),eq(patientContacts.patientId,caregiverGrants.patientId)))
    .innerJoin(records,and(eq(records.id,caregiverGrants.consentRecordId),eq(records.patientId,caregiverGrants.patientId)))
    .where(and(patientId?eq(caregiverGrants.patientId,patientId):undefined,userId?eq(caregiverGrants.userId,userId):undefined));
}
export function effectiveCaregiverGrant(row:Awaited<ReturnType<typeof caregiverRows>>[number]) {
  const g=row.grant,c=row.contact;
  const m=row.consentMetadata,signedScopes=m.scopes;
  const consentMatches=row.consentKind==="consents"&&m.consentType==="caregiver_sharing"&&m.grantId===g.id&&m.caregiverId===g.userId&&m.contactId===g.contactId&&m.signedById===g.grantedBy&&m.method===g.method&&m.attested===true&&
    Date.parse(String(m.expiresAt))===g.expiresAt.getTime()&&Array.isArray(signedScopes)&&signedScopes.length===g.scopes.length&&g.scopes.every(scope=>signedScopes.includes(scope));
  let effectiveStatus="active";
  if(g.status!=="active")effectiveStatus="revoked";
  else if(g.expiresAt.getTime()<=Date.now())effectiveStatus="expired";
  else if(!c)effectiveStatus="contact_unavailable";
  else if(!consentMatches||!c.sharingAllowed||!c.consentRecordedAt||c.consentRecordedAt>g.grantedAt||row.consentStatus!=="captured"||row.user.role!=="caregiver"||row.user.status==="inactive"||!c.email||c.email.toLowerCase()!==row.user.email.toLowerCase())effectiveStatus="permission_withdrawn";
  const groups=new Set(c?.sharingScope??[]);
  const scopes=g.scopes.filter(scope=>caregiverScopes.includes(scope as typeof caregiverScopes[number])&&(groups.has(scope.split(".")[0]!)||scope.startsWith("readings.")&&groups.has("observations")));
  if(effectiveStatus==="active"&&!scopes.length)effectiveStatus="permission_withdrawn";
  return {id:g.id,caregiverName:row.user.name,email:row.user.email,scopes:effectiveStatus==="active"?scopes:g.scopes,status:g.status,effectiveStatus,grantedAt:g.grantedAt.toISOString(),expiresAt:g.expiresAt.toISOString(),reason:g.reason};
}
export async function requireCaregiverGrant(actor:Actor,patientId:string,scope?:string) {
  if(actor.role!=="caregiver")throw new AppError(403,"This portal is for invited family caregivers.");
  const row=(await caregiverRows(db,patientId,actor.id)).find(r=>effectiveCaregiverGrant(r).effectiveStatus==="active");
  if(!row)throw new AppError(403,"The patient has not granted active access, or permission has been withdrawn.");
  const view=effectiveCaregiverGrant(row);
  if(scope&&!view.scopes.includes(scope))throw new AppError(403,"The patient's permission does not include this section.");
  return view;
}
export async function createCaregiverGrant(actor:Actor,patientId:string,raw:unknown) {
  authorize(actor,"clinical.write");await assertPatientAccess(actor,patientId);
  const input=inputSchema.parse(raw),now=new Date(),expiresAt=input.expiresAt?new Date(input.expiresAt):new Date(Date.now()+90*86400000);
  if(expiresAt<=now||expiresAt.getTime()>Date.now()+366*86400000)throw new AppError(400,"Choose a future expiry within one year.");
  if(new Set(input.scopes).size!==input.scopes.length||input.scopes.includes("messages.send")&&!input.scopes.includes("messages.read"))throw new AppError(400,"Choose unique sections; sending messages also requires permission to read them.");
  return db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    const [contact]=await s.select().from(patientContacts).where(and(eq(patientContacts.id,input.contactId),eq(patientContacts.patientId,patientId))).for("update");
    const [user]=await s.select().from(users).where(eq(users.id,input.userId)).for("key share");
    if(!contact||!contact.sharingAllowed||!contact.consentRecordedAt)throw new AppError(400,"First record this contact's information-sharing permission in the clinical profile.");
    if(!user||user.role!=="caregiver"||!["active","invited"].includes(user.status)||!contact.email||contact.email.toLowerCase()!==user.email.toLowerCase())throw new AppError(400,"Invite a Family caregiver account matching this contact's email before granting access.");
    if(input.scopes.some(scope=>!contact.sharingScope.includes(scope.split(".")[0]!)&&!(scope.startsWith("readings.")&&contact.sharingScope.includes("observations"))))throw new AppError(400,"The requested sections exceed the patient's recorded contact-sharing permission.");
    const [existing]=await s.select().from(caregiverGrants).where(and(eq(caregiverGrants.patientId,patientId),eq(caregiverGrants.userId,user.id),eq(caregiverGrants.status,"active")));
    if(existing)throw new AppError(409,"Revoke the previous grant before recording new permission; its history will be retained.");
    const grantId=id(),consent=await addRecord(s,"consents",{
      patientId,title:`Caregiver sharing permission · ${contact.name}`,status:"captured",description:input.consentText,
      metadata:{consentType:"caregiver_sharing",method:input.method,scopes:input.scopes,contactId:contact.id,caregiverId:user.id,caregiverName:user.name,grantId,consentRecordedAt:now.toISOString(),signedAt:now.toISOString(),signedBy:actor.name,signedById:actor.id,version:1,expiresAt:expiresAt.toISOString(),attested:true},
    },actor);
    const [grant]=await s.insert(caregiverGrants).values({id:grantId,userId:user.id,patientId,contactId:contact.id,scopes:input.scopes,consentRecordId:consent.id,method:input.method,grantedBy:actor.id,expiresAt}).returning();
    const docs=await captureDocuments(s,actor,[{record:consent,origin:"caregiver_consent",eventKey:grantId}]);
    await writeAudit(s,actor,"create_caregiver_grant",grantId,patientId,{caregiverId:user.id,scopes:input.scopes,expiresAt:expiresAt.toISOString(),consentRecordId:consent.id});
    return {grant,documentId:docs[0]?.id??null};
  });
}
export async function revokeCaregiverGrant(actor:Actor,patientId:string,grantId:string,raw:unknown) {
  authorize(actor,"clinical.write");await assertPatientAccess(actor,patientId);
  const {reason}=z.object({reason:z.string().trim().min(10).max(2000)}).parse(raw);
  return db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    const [row]=await s.select().from(caregiverGrants).where(and(eq(caregiverGrants.id,grantId),eq(caregiverGrants.patientId,patientId))).for("update");
    const grant=requireValue(row,"Caregiver permission not found");
    if(grant.status!=="active")throw new AppError(409,"This permission has already been revoked.");
    await s.update(caregiverGrants).set({status:"revoked",revokedAt:new Date(),reason}).where(eq(caregiverGrants.id,grant.id));
    const consent=await getRecord(s,grant.consentRecordId,"consents");
    if(consent.status==="captured")await patchRecord(s,consent,{status:"revoked"},actor,"revoke");
    await writeAudit(s,actor,"revoke_caregiver_grant",grant.id,patientId,{reason,caregiverId:grant.userId,scopes:grant.scopes});
    return {success:true};
  });
}
