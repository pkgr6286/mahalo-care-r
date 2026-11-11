import {z} from "zod";
import type {Actor} from "./store";
import {permissionsFor} from "./access";

export const emergencyContextSchema=z.object({
  patientId:z.string().min(1).max(100),patientName:z.string().min(1).max(220),mrn:z.string().min(1).max(100),
  location:z.string().min(1).max(100),reason:z.string().min(20).max(1000),
  startedAt:z.string().datetime(),expiresAt:z.string().datetime(),
});
export function applyEmergencyContext(normal:Actor,raw:unknown,clock=Date.now()):Actor {
  const result=emergencyContextSchema.safeParse(raw);
  if(!normal.canUseEmergencyAccess||!result.success)return {...normal,emergencyContext:null};
  const ctx=result.data,start=Date.parse(ctx.startedAt),end=Date.parse(ctx.expiresAt);
  if(start>clock||end<=clock||end<=start||end-start>4*60*60*1000)return {...normal,emergencyContext:null};
  return {...normal,role:"emergency_read_only",permissions:permissionsFor("emergency_read_only"),locationScopes:[ctx.location],emergencyContext:ctx,canUseEmergencyAccess:false};
}
