import { jobs } from "@workspace/db";
import { eq } from "drizzle-orm";
import { id, type Store } from "./store";
import { requireValue } from "./errors";

export const jobView=(j:typeof jobs.$inferSelect)=>({
  id:j.id,kind:j.kind,status:j.status,attempts:j.attempts,maxAttempts:j.maxAttempts,runAt:j.runAt.toISOString(),
  createdAt:j.createdAt.toISOString(),finishedAt:j.finishedAt?.toISOString()??null,error:j.error,result:j.result,
});
export async function enqueueJob(s:Store,kind:string,dedupeKey:string,payload:Record<string,unknown>={}) {
  const [inserted]=await s.insert(jobs).values({id:id(),kind,dedupeKey,payload}).onConflictDoNothing({target:jobs.dedupeKey}).returning();
  if(inserted) return inserted;
  const [existing]=await s.select().from(jobs).where(eq(jobs.dedupeKey,dedupeKey));
  return requireValue(existing);
}
