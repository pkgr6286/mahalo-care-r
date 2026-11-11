export type PatientSortKey = "patient" | "programs" | "location" | "risk" | "minutes" | "adherence" | "lastContact";
export type SortDirection = "asc" | "desc";
type SortablePatient = {
  id: string; firstName: string; lastName: string; programs: string[];
  location?: string | null; risk?: string | null; minutes?: number | null;
  adherence?: number | null; lastContact?: string | null;
};
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const riskRank: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
function value(p: SortablePatient, key: PatientSortKey): string | number | null {
  switch (key) {
    case "patient": return `${p.lastName}, ${p.firstName}`;
    case "programs": return p.programs.length ? [...p.programs].sort(collator.compare).join(", ") : null;
    case "location": return p.location?.trim() || null;
    case "risk": return riskRank[p.risk?.toLowerCase() ?? ""] ?? null;
    case "minutes": case "adherence": return typeof p[key] === "number" && Number.isFinite(p[key]) ? p[key]! : null;
    case "lastContact": {
      const time = p.lastContact ? Date.parse(p.lastContact) : NaN;
      return Number.isFinite(time) ? time : null;
    }
  }
}
/** Sort the complete filtered panel before pagination. Missing evidence stays last in either direction. */
export function sortPatients<T extends SortablePatient>(patients: readonly T[], key: PatientSortKey, direction: SortDirection): T[] {
  return [...patients].sort((a, b) => {
    const av = value(a, key), bv = value(b, key);
    if (av === null && bv !== null) return 1;
    if (bv === null && av !== null) return -1;
    const difference = av === null || bv === null ? 0 : typeof av === "number" && typeof bv === "number" ? av - bv : collator.compare(String(av), String(bv));
    return difference * (direction === "asc" ? 1 : -1)
      || collator.compare(`${a.lastName}, ${a.firstName}`, `${b.lastName}, ${b.firstName}`)
      || collator.compare(a.id, b.id);
  });
}
