import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";
import { datasetMemberships } from "@workspace/db";
import { config } from "./config";
import type { Store } from "./store";

const validationRun=new AsyncLocalStorage<string>();
/** Tracks local test creations only. It never changes authentication, authorization or patient ownership. */
export const trackValidationRun:RequestHandler=(req,_res,next)=>{
  const run=req.get("x-mahalo-validation-run");
  if(config.NODE_ENV==="development"&&run&&/^[0-9a-f-]{36}$/.test(run)) validationRun.run(run,next);
  else next();
};
export async function trackValidationCreation(s:Store,action:string,id:string) {
  const run=validationRun.getStore();
  if(!run||!action.startsWith("create_")&&action!=="import_patient")return;
  const entityType=["create_patient","import_patient"].includes(action)?"patient":["create_account","create_user"].includes(action)?"user":action==="create_policy"?"policy":action==="create_caregiver_grant"?"caregiver_grant":"record";
  await s.insert(datasetMemberships).values({entityType,entityId:id,dataset:"validation_pending",reason:`Local validation ${run}`}).onConflictDoNothing();
}
