import type { ActionInput, CareRecord } from "@workspace/api-client-react";

/** Mirrors backend PDF retention exactly; anything else downloads as an unretained preview. */
export function isRetainedDocument(r: CareRecord): boolean {
  const s = (r.status ?? "").toLowerCase();
  switch (r.kind) {
    case "notes": return ["signed", "amended", "superseded"].includes(s);
    case "careplans": return ["active", "superseded", "closed"].includes(s);
    case "consents": return ["captured", "revoked"].includes(s);
    case "billing": return r.metadata?.closed === true;
    default: return false;
  }
}
export const isDiscardedDraft = (r: CareRecord) => r.status === "cancelled" && !!r.metadata?.draftDiscardedAt;

export const DISCARD_DRAFT: ActionInput["action"] = "discardDraft";
export const RESTORE_DRAFT: ActionInput["action"] = "restoreDraft";

export const isConflict = (e: unknown) => !!e && typeof e === "object" && "status" in e && (e as { status: number }).status === 409;
