import {db,users} from "@workspace/db";
import {and,eq} from "drizzle-orm";
import {hashPassword} from "./passwords";
import {addRecord,writeAudit} from "./store";
const staff=[
  ["provider","Nora Patel","billing_provider","MD"],
  ["caremanager","Elena Garcia","care_manager","RN"],
  ["behavioral","Avery Morgan","behavioral_care_manager","LCSW"],
  ["consultant","Jordan Reed","psychiatric_consultant","psych_consultant"],
  ["therapist","Mia Chen","therapist","PT"],
  ["frontdesk","Taylor Brooks","front_desk","MA"],
  ["billing","Alex Rivera","billing","billing"],
  ["readonly","Morgan Lee","read_only","admin"],
  ["clinicaladmin","Camila Ross","clinical_admin","RN"],
] as const;
/** Synthetic demo only. Existing accounts, changed passwords and deactivations are never reset. */
export async function ensureStaffDemoAccounts() {
  const [demo]=await db.select({id:users.id}).from(users).where(and(eq(users.id,"demo-admin"),eq(users.email,"demo@mahalo.care"),eq(users.status,"active")));
  if(!demo) return;
  const actor={id:"system",name:"Mahalo synthetic demo setup",email:"",role:"admin",credential:"admin",locationScopes:[]};
  for(const [key,name,role,credential] of staff) {
    const email=`${key}@mahalo.care`;
    const [existing]=await db.select({id:users.id}).from(users).where(eq(users.email,email));
    if(existing) continue;
    const passwordHash=await hashPassword("MahaloDemo2026!");
    await db.transaction(async s=>{
      const [created]=await s.insert(users).values({id:`demo-${key}`,email,name,role,credential,passwordHash}).onConflictDoNothing().returning({id:users.id});
      if(!created) return;
      await addRecord(s,"staff",{title:name,status:"active",metadata:{userId:created.id,email,role,credential,locationScopes:[],synthetic:true}},actor);
      await writeAudit(s,actor,"create_synthetic_demo_account",created.id,null,{role,synthetic:true});
    });
  }
}
