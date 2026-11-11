import { AlarmClock, ClipboardCheck, FileSignature, HeartPulse, Inbox, ListTodo, Router, UsersRound } from "lucide-react";
import type { GetWorklistParams, WorklistFilters, WorklistItem, WorklistKind } from "@workspace/api-client-react";
import { mStr } from "@/lib/api";

export type WlKind = WorklistKind;
export type WlStatus = "open" | "closed" | "all";
export type WlFilters = { q: string; program: string; locations: string[]; assignee: string; ownerRole: string; status: WlStatus; period: string; includeInactive: boolean; pageSize: number };

export const VIEWS = [
  { id: "my_exceptions", label: "My exceptions", desc: "Open exceptions assigned to you or your role.", icon: Inbox },
  { id: "team_queue", label: "Team queue", desc: "All exception work across your accessible sites. Owner role filters only when you choose one.", icon: UsersRound },
  { id: "due_today", label: "Due today", desc: "Staff tasks and follow-ups due by end of day, patient time.", icon: AlarmClock },
  { id: "tasks", label: "Tasks", desc: "All staff tasks in your scope.", icon: ListTodo },
  { id: "at_risk", label: "Billing at risk", desc: "Based on the last provisional billing calculation, not a live forecast.", icon: ClipboardCheck },
  { id: "unsigned", label: "Unsigned", desc: "Draft notes and care plans awaiting signature.", icon: FileSignature },
  { id: "device_issues", label: "Device issues", desc: "Devices with no data, low battery or connectivity gaps, including inactive patients whose equipment is not yet returned.", icon: Router },
  { id: "cocm_registry", label: "CoCM registry", desc: "One BHI enrollment per patient with scores and consultant review cadence.", icon: HeartPulse },
] as const satisfies readonly { id: WlKind; label: string; desc: string; icon: unknown }[];

/** Billing month (YYYY-MM); only meaningful on the at_risk view. */
export const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const PAGE_SIZES = [10, 25, 50, 100];
export const DEFAULT_FILTERS: WlFilters = { q: "", program: "", locations: [], assignee: "", ownerRole: "", status: "open", period: "", includeInactive: false, pageSize: 25 };
const KINDS: string[] = VIEWS.map((v) => v.id);
export const isKind = (v: unknown): v is WlKind => typeof v === "string" && KINDS.includes(v);
const clampSize = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? Math.min(100, Math.max(10, Math.round(v))) : DEFAULT_FILTERS.pageSize; };
const isStatus = (v: unknown): v is WlStatus => v === "open" || v === "closed" || v === "all";

export function fromSaved(f?: WorklistFilters | null): WlFilters {
  if (!f) return { ...DEFAULT_FILTERS };
  return {
    q: f.q ?? "", program: f.program ?? "", locations: Array.isArray(f.locations) ? f.locations : [], assignee: f.assignee ?? "", ownerRole: f.ownerRole ?? "",
    status: isStatus(f.status) ? f.status : "open", period: f.period ?? "", includeInactive: !!f.includeInactive, pageSize: f.pageSize ? clampSize(f.pageSize) : DEFAULT_FILTERS.pageSize,
  };
}
export function toSaved(f: WlFilters): WorklistFilters {
  // Every key is sent explicitly so cleared values overwrite older saved values.
  return { status: f.status, pageSize: f.pageSize, q: f.q.trim(), program: f.program, locations: f.locations, assignee: f.assignee, ownerRole: f.ownerRole, period: f.period, includeInactive: f.includeInactive };
}
export const sameFilters = (a: WlFilters, b: WlFilters) => JSON.stringify(toSaved(a)) === JSON.stringify(toSaved(b));

export function toParams(kind: WlKind, page: number, f: WlFilters): GetWorklistParams {
  // Server merges saved filters then query params: cleared strings must be sent as "" (not omitted) or saved values reappear.
  return {
    kind, page, pageSize: f.pageSize, status: f.status, q: f.q.trim(), program: f.program, locations: f.locations.join(","),
    assignee: f.assignee, ownerRole: f.ownerRole, period: kind === "at_risk" && isMonth(f.period) ? f.period : "", includeInactive: f.includeInactive,
  };
}

/** URL <-> state. Returns hasFilters=false when the URL carries no filter keys so saved filters can apply. */
export function readUrl(search: string) {
  const u = new URLSearchParams(search);
  const kind = u.get("view");
  const filterKeys = ["q", "program", "locations", "assignee", "ownerRole", "status", "period", "includeInactive", "pageSize"];
  const hasFilters = filterKeys.some((k) => u.has(k));
  const f: WlFilters = {
    q: u.get("q") ?? "", program: u.get("program") ?? "", locations: (u.get("locations") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    assignee: u.get("assignee") ?? "", ownerRole: u.get("ownerRole") ?? "", status: isStatus(u.get("status")) ? (u.get("status") as WlStatus) : "open",
    period: u.get("period") ?? "", includeInactive: u.get("includeInactive") === "1", pageSize: u.has("pageSize") ? clampSize(u.get("pageSize")) : DEFAULT_FILTERS.pageSize,
  };
  const page = Math.max(1, Number(u.get("page")) || 1);
  return { kind: isKind(kind) ? kind : null, page, f, hasFilters };
}
export function writeUrl(kind: WlKind, page: number, f: WlFilters) {
  const u = new URLSearchParams();
  u.set("view", kind);
  const p = toParams(kind, page, f);
  for (const [k, v] of Object.entries(p)) if (k === "includeInactive") { if (v) u.set(k, "1"); } else if (k !== "kind" && k !== "page" && v !== undefined && v !== "") u.set(k, String(v));
  if (page > 1) u.set("page", String(page));
  const next = window.location.pathname + "?" + u.toString();
  if (next !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, "", next);
}

const CLOSED = ["resolved", "dismissed", "closed", "completed", "done", "cancelled", "signed"];
const DEVICE_DONE = ["returned", "retired", "inactive"];
const LEGACY_PATIENT_TASKS = ["reading", "checkin", "med", "medication", "exercise", "education"];
/** Staff task: explicit audience "staff", or legacy rows with no audience that are not patient adherence/reading items. */
function isStaffTask(r: WorklistItem["record"]) {
  const m = (r.metadata ?? {}) as Record<string, unknown>;
  if (m.audience === "staff") return true;
  if (m.audience === "patient") return false;
  if (m.adherenceKind != null) return false;
  const t = m.taskKind ?? m.type ?? m.kind;
  return !(t != null && LEGACY_PATIENT_TASKS.includes(String(t).toLowerCase()));
}
/** Shortfall unit: minutes for management codes, days for supply codes. */
export const shortfallUnit = (r: WorklistItem["record"]) => (mStr(r, "codeKind") === "supply" ? "days" : "min");
/** Returns null when the row may be reassigned by this user, otherwise a short reason. */
export function assignBlock(item: WorklistItem, allow: (...p: string[]) => boolean): string | null {
  const r = item.record;
  const s = (r.status ?? "").toLowerCase();
  let ok = false;
  if (r.kind === "exceptions") ok = !CLOSED.includes(s); // includes acknowledged
  else if (r.kind === "tasks") ok = (s === "pending" || s === "open") && isStaffTask(r);
  else if (r.kind === "notes" || r.kind === "careplans") ok = s === "draft";
  else if (r.kind === "enrollments") ok = s === "active" || s === "paused";
  else if (r.kind === "devices") ok = !!s && !DEVICE_DONE.includes(s);
  else return "Not reassignable";
  if (!ok) return s === "signed" ? "Signed records cannot be reassigned" : "Closed records cannot be reassigned";
  const perm = r.kind === "devices" ? allow("devices.write") : allow("clinical.write");
  return perm ? null : "Read only";
}

export function fmtAge(h: number) {
  if (!Number.isFinite(h)) return "";
  if (h < 1) return "<1h";
  if (h < 48) return Math.round(h) + "h";
  return Math.round(h / 24) + "d";
}
export function fmtInTz(iso: string | null | undefined, tz?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  try { return d.toLocaleString(undefined, { ...o, timeZone: tz || undefined, timeZoneName: tz ? "short" : undefined }); } catch { return d.toLocaleString(undefined, o); }
}
export const daysSince = (iso?: string | null) => { if (!iso) return null; const t = Date.parse(iso); return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 864e5)) : null; };

export const CONSULTANT_ROLES = ["admin", "clinical_admin", "billing_provider", "psychiatric_consultant"];
export const CONSULTANT_CREDS = ["MD", "DO", "NP", "PA", "psych_consultant"];
export const canAttestConsultant = (u?: { role: string; credential: string }) => !!u && CONSULTANT_ROLES.includes(u.role) && CONSULTANT_CREDS.includes(u.credential);

/** Roles that may own clinical rows (clinical.write) and device rows (devices.write). Server is authoritative. */
export const CLINICAL_ASSIGNEE_ROLES = ["admin", "clinical_admin", "billing_provider", "care_manager", "behavioral_care_manager", "psychiatric_consultant", "therapist"];
export const DEVICE_ASSIGNEE_ROLES = ["admin", "clinical_admin", "billing_provider", "care_manager", "behavioral_care_manager", "therapist", "front_desk"];
/** Eligible assignees for a selection: intersects clinical and device rules when the selection mixes both. */
export function eligibleAssignees<A extends { role: string }>(all: A[], kinds: { clinical: boolean; device: boolean }) {
  return all.filter((a) => (!kinds.clinical || CLINICAL_ASSIGNEE_ROLES.includes(a.role)) && (!kinds.device || DEVICE_ASSIGNEE_ROLES.includes(a.role)));
}
