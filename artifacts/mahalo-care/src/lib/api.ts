import { useQueryClient } from "@tanstack/react-query";
import {
  usePerformAction,
  useCreateRecord,
  useUpdateRecord,
  type getListRecordsQueryKey,
  type ActionInput,
  type ActionResult,
  type CareRecord,
  type RecordInput,
} from "@workspace/api-client-react";
import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export type Kind = Parameters<typeof getListRecordsQueryKey>[0];
export type ActionName = ActionInput["action"];

export function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "data" in e) {
    const d = (e as { data: unknown }).data;
    if (d && typeof d === "object") {
      const o = d as Record<string, unknown>;
      if (typeof o.error === "string") return o.error;
      if (typeof o.message === "string") return o.message;
    }
    if (typeof d === "string" && d) return d;
  }
  return e instanceof Error ? e.message : "Something went wrong";
}

export function isUnauthorized(e: unknown) {
  return !!e && typeof e === "object" && "status" in e && (e as { status: number }).status === 401;
}

export function useAction() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = usePerformAction();
  const run = (input: ActionInput, onDone?: (r: ActionResult) => void, opts?: { always?: boolean }) =>
    m.mutate(
      { data: input },
      {
        onSuccess: (r) => {
          qc.invalidateQueries();
          toast({
            title: r.success ? "Recorded" : "Not completed",
            description: r.message,
            variant: r.success ? undefined : "destructive",
          });
          if (r.success || opts?.always) onDone?.(r);
        },
        onError: (e) => toast({ title: "Action failed", description: errMsg(e), variant: "destructive" }),
      },
    );
  return { run, pending: m.isPending };
}

export function useSaveRecord() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const c = useCreateRecord();
  const u = useUpdateRecord();
  /** opts.expectedUpdatedAt: updatedAt of the record when the user STARTED editing; a stale write returns 409. */
  const save = (kind: Kind, data: RecordInput, id?: string, onDone?: (r: CareRecord) => void, opts?: { expectedUpdatedAt?: string; onError?: (e: unknown) => void }) => {
    const cb = {
      onSuccess: (r: CareRecord) => {
        qc.invalidateQueries();
        toast({ title: id ? "Changes saved" : "Created", description: r.title });
        onDone?.(r);
      },
      onError: (e: unknown) => {
        const conflict = !!e && typeof e === "object" && "status" in e && (e as { status: number }).status === 409;
        toast({ title: conflict ? "Not saved: record changed" : "Could not save", description: conflict ? "Someone else saved a newer version. Your unsaved text is kept in the editor." : errMsg(e), variant: "destructive" });
        opts?.onError?.(e);
      },
    };
    if (id) u.mutate({ kind, id, data: opts?.expectedUpdatedAt ? { ...data, expectedUpdatedAt: opts.expectedUpdatedAt } : data }, cb);
    else c.mutate({ kind, data }, cb);
  };
  return { save, pending: c.isPending || u.isPending };
}

/** Strip a record down to the RecordInput shape for updates */
export function toInput(r: CareRecord, patch: Partial<RecordInput> = {}): RecordInput {
  return {
    title: r.title,
    patientId: r.patientId ?? null,
    program: r.program ?? null,
    status: r.status,
    severity: r.severity,
    description: r.description,
    assignee: r.assignee,
    date: r.date,
    value: r.value,
    unit: r.unit,
    metadata: r.metadata ?? {},
    ...patch,
  };
}

export function toDate(v?: string | null) {
  if (!v) return null;
  const d = parseISO(v);
  return isValid(d) ? d : null;
}
export function fmtDate(v?: string | null, f = "MMM d, yyyy") {
  const d = toDate(v);
  return d ? format(d, f) : "—";
}
export function fmtDateTime(v?: string | null) {
  return fmtDate(v, "MMM d, h:mm a");
}
export function fmtRel(v?: string | null) {
  const d = toDate(v);
  return d ? `${formatDistanceToNowStrict(d)} ago` : "—";
}

export function mStr(r: CareRecord | undefined, k: string): string {
  const v = r?.metadata?.[k];
  return v === undefined || v === null ? "" : String(v);
}
export function mNum(r: CareRecord | undefined, k: string): number | undefined {
  const v = r?.metadata?.[k];
  const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}
export function mArr(r: CareRecord | undefined, k: string): string[] {
  const v = r?.metadata?.[k];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v) return v.split("\n").filter(Boolean);
  return [];
}
export function mBool(r: CareRecord | undefined, k: string) {
  const v = r?.metadata?.[k];
  return v === true || v === "true";
}

export const PROGRAMS = ["RPM", "RTM", "CCM", "PCM", "BHI"] as const;
export const PROGRAM_NAMES: Record<string, string> = {
  RPM: "Remote Physiologic Monitoring",
  RTM: "Remote Therapeutic Monitoring",
  CCM: "Chronic Care Management",
  PCM: "Principal Care Management",
  BHI: "Behavioral Health Integration",
};

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export const ACTIVITIES: { value: string; label: string }[] = [
  { value: "review_data", label: "Review monitoring data" },
  { value: "phone_call", label: "Phone call" },
  { value: "video_visit", label: "Video visit" },
  { value: "care_plan_update", label: "Care plan update" },
  { value: "care_coordination", label: "Care coordination" },
  { value: "patient_education", label: "Patient education" },
  { value: "documentation", label: "Documentation" },
];
export function activityLabel(v: string) {
  return ACTIVITIES.find((a) => a.value === v)?.label ?? v.replace(/_/g, " ");
}
