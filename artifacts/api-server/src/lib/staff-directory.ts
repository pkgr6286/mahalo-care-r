import {and,desc,eq,sql} from "drizzle-orm";
import {db,records,users} from "@workspace/db";
import {addRecord,patchRecord,type Actor,type Store} from "./store";
import {clinicalAccount,clinicalRecord} from "./datasets";
import {isDeepStrictEqual} from "node:util";
import {AppError} from "./errors";
const clinicalRoles=new Set(["admin","clinical_admin","billing_provider","care_manager","behavioral_care_manager","psychiatric_consultant","therapist"]);
const professionalCredentials=new Set(["MD","DO","NP","PA","RN","LPN","PT","OT","SLP","LCSW","psych_consultant"]);
type StaffIdentity=Pick<typeof users.$inferSelect,"id"|"name"|"email"|"role"|"credential"|"status"|"locationScopes"|"siteRoles"|"npi">;
const identityFields=["userId","email","role","credential","npi","locationScopes","siteRoles","accountStatus","identitySource"];
export function assertManagedDirectoryIdentity(r:typeof records.$inferSelect,input:{title?:string;status?:string;metadata?:Record<string,unknown>}){
  if(r.metadata.identitySource!=="staff_account")return;
  if(input.title!==undefined&&input.title!==r.title||input.status!==undefined&&input.status!==r.status||identityFields.some(k=>input.metadata&&Object.hasOwn(input.metadata,k)&&!isDeepStrictEqual(input.metadata[k],r.metadata[k])))throw new AppError(409,"Change linked names, credentials, NPI, status and site access in Staff accounts, not the clinical directory.");
}
export async function assertManualDirectoryCreation(s:Store,metadata:Record<string,unknown>={}){
  if(metadata.identitySource==="staff_account")throw new AppError(409,"Managed clinical directory entries are created automatically from Staff accounts.");
  if(typeof metadata.userId==="string"){
    const [user]=await s.select({id:users.id}).from(users).where(eq(users.id,metadata.userId));
    if(user)throw new AppError(409,"This staff account already has an automatically managed clinical directory entry.");
  }
}
/** Directory labels mirror accounts; directory rows are never an authorization source. */
export async function syncClinicalStaffDirectory(s:Store,u:StaffIdentity,actor:Actor){
  const [prior]=await s.select().from(records).where(and(eq(records.kind,"staff"),clinicalRecord,sql`${records.metadata}->>'userId'=${u.id}`)).orderBy(desc(records.createdAt)).limit(1);
  const roles=Object.keys(u.siteRoles).length?Object.values(u.siteRoles):[u.role];
  const eligible=!["patient","caregiver"].includes(u.role)&&professionalCredentials.has(u.credential)&&roles.some(r=>clinicalRoles.has(r));
  if(!eligible&&!prior)return;
  const metadata={...prior?.metadata,userId:u.id,email:u.email,role:u.role,credential:u.credential,npi:u.npi,locationScopes:u.locationScopes,siteRoles:u.siteRoles,accountStatus:u.status,identitySource:"staff_account"};
  const patch={title:u.name,status:eligible&&u.status==="active"?"active":"inactive",metadata};
  if(!prior){await addRecord(s,"staff",{...patch,description:"Clinical team member linked to a managed staff account."},actor);return;}
  const changed=prior.title!==patch.title||prior.status!==patch.status||identityFields.some(k=>!isDeepStrictEqual(prior.metadata[k],metadata[k as keyof typeof metadata]));
  if(changed)await patchRecord(s,prior,patch,actor,"sync_staff_directory");
}
export async function refreshClinicalStaffDirectory(){
  const actor:Actor={id:"system",name:"Mahalo account-directory synchronization",email:"",role:"admin",credential:"admin",locationScopes:[]};
  await db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    const people=await s.select().from(users).where(and(clinicalAccount,sql`NOT EXISTS(SELECT 1 FROM care_dataset_memberships d WHERE d.entity_type='user' AND d.entity_id=${users.id} AND d.dataset='validation_pending')`));
    for(const u of people)await syncClinicalStaffDirectory(s,u,actor);
  });
}
