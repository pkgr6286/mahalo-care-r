import { Fragment, useState } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { WorklistItem } from "@workspace/api-client-react";
import { Pill, ProgramTag, StatusPill, toneFor } from "@/components/kit";
import { ExceptionRow, TaskRow } from "@/components/records";
import { fmtAge, fmtInTz, shortfallUnit } from "@/lib/worklist";
import { cn } from "@/lib/utils";

const sevBar: Record<string, string> = { critical: "bg-destructive", high: "bg-[hsl(14_85%_55%)]", medium: "bg-[hsl(38_90%_52%)]", low: "bg-[hsl(220_15%_70%)]" };
export type SelectProps = { selected: Set<string>; block: (i: WorklistItem) => string | null; onToggle: (id: string) => void; onToggleAll: (ids: string[], on: boolean) => void };

export function SelectAll({ items, selected, block, onToggleAll }: { items: WorklistItem[] } & Omit<SelectProps, "onToggle">) {
  const ids = items.filter((i) => !block(i)).map((i) => i.id);
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  return <input type="checkbox" aria-label="Select all eligible rows on this page" disabled={!ids.length} checked={all} onChange={() => onToggleAll(ids, !all)} className="accent-[hsl(var(--primary))]" data-testid="check-wl-all" />;
}
export function RowCheck({ item, selected, block, onToggle }: { item: WorklistItem } & Omit<SelectProps, "onToggleAll">) {
  const why = block(item);
  return <input type="checkbox" aria-label={why ? "Cannot select: " + why : "Select " + item.title} title={why ?? undefined} disabled={!!why} checked={selected.has(item.id)} onChange={() => onToggle(item.id)} className="accent-[hsl(var(--primary))] disabled:opacity-30" data-testid={"check-wl-" + item.id} />;
}
export function PatientCell({ i, chart }: { i: WorklistItem; chart: boolean }) {
  return (
    <div className="min-w-0">
      {chart ? <Link href={"/patients/" + i.patientId} className="font-medium text-foreground hover:text-primary" data-testid={"link-wl-patient-" + i.id}>{i.patientName}</Link> : <span className="font-medium">{i.patientName}</span>}
      <div className="truncate text-[11px] text-muted-foreground"><span className="font-mono">{i.mrn}</span>{i.location ? " · " + i.location : ""}</div>
    </div>
  );
}

export function WorklistTable({ items, chart, sel }: { items: WorklistItem[]; chart: boolean; sel: SelectProps }) {
  const [open, setOpen] = useState<string | null>(null);
  const th = "wl-cell px-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";
  return (
    <div className="overflow-x-auto rounded-xl border border-card-border bg-card" data-testid="table-worklist">
      <table className="w-full min-w-[860px] border-collapse">
        <thead className="border-b border-border bg-secondary/40">
          <tr>
            <th className={cn(th, "w-10")}><SelectAll items={items} {...sel} /></th>
            <th className={th}>Patient</th><th className={th}>Item</th><th className={th}>Program</th><th className={th}>Assignee</th><th className={th}>Due · age</th><th className={th}>State</th><th className={cn(th, "w-8")}><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const isOpen = open === i.id;
            const meta = [i.cpt && "CPT " + i.cpt, i.daysLeft != null && i.daysLeft + " days left", i.shortfall != null && "short " + i.shortfall + " " + shortfallUnit(i.record)].filter(Boolean).join(" · ");
            return (
              <Fragment key={i.id}>
                <tr className={cn("wl-row border-b border-border align-top last:border-b-0", sel.selected.has(i.id) && "bg-accent/40")} data-testid={"row-wl-" + i.id}>
                  <td className="wl-cell relative px-3"><span className={cn("absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full", sevBar[i.severity?.toLowerCase()] ?? "bg-transparent")} /><RowCheck item={i} {...sel} /></td>
                  <td className="wl-cell px-3"><PatientCell i={i} chart={chart} /></td>
                  <td className="wl-cell max-w-[30rem] px-3">
                    <div className="font-medium leading-snug">{i.title}</div>
                    {(i.issueReasons.length > 0 || meta) && (
                      <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                        {i.issueReasons.slice(0, 4).map((r) => <span key={r} className="rounded-md bg-secondary px-1.5 py-px">{r}</span>)}
                        {meta && <span className="tnum">{meta}</span>}
                      </div>
                    )}
                  </td>
                  <td className="wl-cell px-3"><ProgramTag p={i.program} /></td>
                  <td className="wl-cell px-3 text-muted-foreground">{i.assignee || <span className="italic">Unassigned</span>}{i.ownerRole ? <div className="text-[11px]">{i.ownerRole.replace(/_/g, " ")}</div> : null}</td>
                  <td className="wl-cell whitespace-nowrap px-3 tnum text-muted-foreground">{i.dueAt ? fmtInTz(i.dueAt, i.timezone) : "No due time"}<div className="text-[11px]">{fmtAge(i.ageHours)} old</div></td>
                  <td className="wl-cell px-3"><div className="flex flex-wrap gap-1">{i.severity && <Pill tone={toneFor(i.severity)}>{i.severity}</Pill>}<StatusPill value={i.status} /></div></td>
                  <td className="wl-cell px-2"><button type="button" onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen} aria-label={(isOpen ? "Hide" : "Show") + " details for " + i.title} className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" data-testid={"button-wl-expand-" + i.id}>{isOpen ? <ChevronDown className="h-4 w-4" strokeWidth={1.6} /> : <ChevronRight className="h-4 w-4" strokeWidth={1.6} />}</button></td>
                </tr>
                {isOpen && <tr className="border-b border-border bg-secondary/25"><td colSpan={8} className="px-4 py-3"><RecordDetail i={i} /></td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecordDetail({ i }: { i: WorklistItem }) {
  const r = i.record;
  const facts = Object.entries(r.metadata ?? {}).filter(([, v]) => v !== null && v !== "" && (typeof v !== "object")).slice(0, 10);
  return (
    <div className="space-y-2 text-xs" data-testid={"detail-wl-" + i.id}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        <span>Source <span className="font-medium text-foreground">{r.kind}</span> · <span className="font-mono">{r.id}</span></span>
        <span>Created {fmtInTz(r.createdAt, i.timezone)}</span>
        <span>Patient time zone {i.timezone || "not set"}</span>
      </div>
      {r.description && <p className="max-w-[80ch] text-foreground/85">{r.description}</p>}
      {facts.length > 0 && <dl className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">{facts.map(([k, v]) => <div key={k} className="flex gap-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="truncate font-mono">{String(v)}</dd></div>)}</dl>}
      {r.kind === "exceptions" && <div className="rounded-lg border border-border bg-card px-3"><ExceptionRow r={r} showPatient={false} /></div>}
      {r.kind === "tasks" && <div className="rounded-lg border border-border bg-card px-3"><TaskRow r={r} showPatient={false} /></div>}
    </div>
  );
}
