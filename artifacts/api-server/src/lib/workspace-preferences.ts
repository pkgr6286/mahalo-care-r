import {db,userPreferences} from "@workspace/db";
import {eq,sql} from "drizzle-orm";
import {WorklistFiltersSchema,WorklistKindSchema,type WorklistKind} from "./worklist-filters";
import {writeAudit,type Actor} from "./store";
import {AppError} from "./errors";
export async function workspacePreferences(actor:Actor) {
  const [row]=await db.select().from(userPreferences).where(eq(userPreferences.userId,actor.id));
  const value=row?.value??{};
  return {density:value.density==="compact"?"compact" as const:"comfortable" as const,lastWorklist:WorklistKindSchema.safeParse(value.lastWorklist).success?value.lastWorklist as WorklistKind:actor.role==="admin"||actor.role==="clinical_admin"?"team_queue" as const:"my_exceptions" as const,worklists:value.worklists&&typeof value.worklists==="object"?value.worklists as Record<string,Record<string,unknown>>:{}};
}
export async function saveWorkspacePreferences(actor:Actor,input:{density?:"comfortable"|"compact";worklist?:{kind:WorklistKind;filters:Record<string,unknown>}}) {
  if(!input.density&&!input.worklist) throw new AppError(400,"Choose a density or worklist preference to save");
  const filters=input.worklist?WorklistFiltersSchema.parse(input.worklist.filters):undefined;
  await db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(hashtextextended(${actor.id},917))`);
    const [old]=await s.select().from(userPreferences).where(eq(userPreferences.userId,actor.id));
    const prior=old?.value??{},oldLists=prior.worklists&&typeof prior.worklists==="object"?prior.worklists as Record<string,unknown>:{};
    const value={...prior,...(input.density?{density:input.density}:{}),...(input.worklist?{lastWorklist:input.worklist.kind,worklists:{...oldLists,[input.worklist.kind]:filters}}:{})};
    await s.insert(userPreferences).values({userId:actor.id,value}).onConflictDoUpdate({target:userPreferences.userId,set:{value,updatedAt:new Date()}});
    await writeAudit(s,actor,"update_own_workspace_preferences",actor.id,null,{density:input.density,worklistKind:input.worklist?.kind});
  });
  return workspacePreferences(actor);
}
