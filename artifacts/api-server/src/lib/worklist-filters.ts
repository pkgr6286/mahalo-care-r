import {z} from "zod";
import {AppError} from "./errors";
export const worklistKinds=["my_exceptions","team_queue","due_today","tasks","at_risk","unsigned","device_issues","cocm_registry"] as const;
export const WorklistKindSchema=z.enum(worklistKinds);
export type WorklistKind=typeof worklistKinds[number];
export function isStaffCareTask(metadata:Record<string,unknown>) {
  return metadata.audience==="staff"||metadata.audience!=="patient"&&metadata.adherenceKind==null&&!["reading","checkin","med","medication","exercise","education"].includes(String(metadata.taskKind??metadata.type??metadata.kind??""));
}
export const WorklistFiltersSchema=z.object({
  q:z.string().trim().max(200).default(""),
  program:z.union([z.literal(""),z.enum(["RPM","RTM","CCM","PCM","BHI"])]).default(""),
  locations:z.array(z.string().min(1).max(200)).max(100).default([]),
  assignee:z.string().max(200).default(""),ownerRole:z.string().max(100).default(""),
  status:z.enum(["open","closed","all"]).default("open"),
  period:z.union([z.literal(""),z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)]).optional(),
  pageSize:z.number().int().min(10).max(100).default(25),includeInactive:z.boolean().default(false),
}).strict();
export type WorklistFilters=z.infer<typeof WorklistFiltersSchema>;
export function parseWorklistQuery(raw:Record<string,unknown>,saved:Record<string,unknown>={}) {
  const kind=WorklistKindSchema.parse(raw.kind);
  const q={...saved,...raw};delete q.kind;
  const page=z.coerce.number().int().min(1).max(100000).parse(q.page??1);delete q.page;
  if(q.locations!==undefined) q.locations=Array.isArray(q.locations)?q.locations:typeof q.locations==="string"?q.locations.split(",").filter(Boolean):q.locations;
  if(q.pageSize!==undefined) q.pageSize=Number(q.pageSize);
  if(typeof q.includeInactive==="string") {if(!["true","false"].includes(q.includeInactive)) throw new AppError(400,"includeInactive must be true or false");q.includeInactive=q.includeInactive==="true";}
  const filters=WorklistFiltersSchema.parse(q);
  filters.locations=[...new Set(filters.locations)];
  return {kind,page,filters};
}
