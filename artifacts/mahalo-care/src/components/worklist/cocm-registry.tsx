import { Link } from "wouter";
import { ArrowDownRight, ArrowUpRight, FolderOpen, Minus, Timer } from "lucide-react";
import type { WorklistItem } from "@workspace/api-client-react";
import { ConfirmButton, Pill } from "@/components/kit";
import { useAction } from "@/lib/api";
import { daysSince, fmtInTz } from "@/lib/worklist";
import { cn } from "@/lib/utils";
import { PatientCell, RowCheck, SelectAll, type SelectProps } from "./worklist-table";
import { ConsultantReviewButton } from "./consultant-review-dialog";

const Nil = ({ label }: { label: string }) => <span className="text-muted-foreground/70" aria-label={label}>—</span>;

function Score({ v, name }: { v?: number | null; name: string }) {
  if (v == null) return <Nil label={"No " + name + " recorded"} />;
  return <span className="tnum font-mono font-semibold">{v}</span>;
}
function Trend({ v }: { v?: number | null }) {
  if (v == null) return <Nil label="Not enough scores for a trend" />;
  const Icon = v > 0 ? ArrowUpRight : v < 0 ? ArrowDownRight : Minus;
  return <span className={cn("tnum inline-flex items-center gap-0.5 font-mono", v > 0 ? "text-destructive" : v < 0 ? "text-[hsl(152_55%_30%)]" : "text-muted-foreground")} title="Change in PHQ-9 since prior score"><Icon className="h-3.5 w-3.5" strokeWidth={1.6} />{v > 0 ? "+" + v : v}</span>;
}

export function CocmRegistry({ items, chart, sel, canTime, canReview }: { items: WorklistItem[]; chart: boolean; sel: SelectProps; canTime: boolean; canReview: boolean }) {
  const { run, pending } = useAction();
  const th = "wl-cell px-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";
  return (
    <div className="overflow-x-auto rounded-xl border border-card-border bg-card" data-testid="table-cocm">
      <table className="w-full min-w-[980px] border-collapse">
        <thead className="border-b border-border bg-secondary/40">
          <tr>
            <th className={cn(th, "w-10")}><SelectAll items={items} {...sel} /></th>
            <th className={th}>Patient</th><th className={th}>PHQ-9</th><th className={th}>GAD-7</th><th className={th}>Trend</th><th className={th}>Since consultant review</th><th className={th}>Last live contact</th><th className={th}>Next review</th><th className={th}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const since = daysSince(i.consultantReviewAt);
            return (
              <tr key={i.id} className={cn("wl-row border-b border-border last:border-b-0", sel.selected.has(i.id) && "bg-accent/40")} data-testid={"row-cocm-" + i.patientId}>
                <td className="wl-cell px-3"><RowCheck item={i} {...sel} /></td>
                <td className="wl-cell px-3"><PatientCell i={i} chart={chart} /><div className="text-[11px] text-muted-foreground">{i.assignee || "Unassigned"}</div></td>
                <td className="wl-cell px-3"><Score v={i.latestPhq9} name="PHQ-9" /></td>
                <td className="wl-cell px-3"><Score v={i.latestGad7} name="GAD-7" /></td>
                <td className="wl-cell px-3"><Trend v={i.scoreTrend} /></td>
                <td className="wl-cell px-3 tnum">{since == null ? <span className="text-xs text-muted-foreground">Never reviewed</span> : <span>{since} day{since === 1 ? "" : "s"}</span>}</td>
                <td className="wl-cell px-3 text-xs text-muted-foreground">{i.lastContactAt ? fmtInTz(i.lastContactAt, i.timezone) : "No live contact recorded"}</td>
                <td className="wl-cell px-3 text-xs">{i.consultantReviewDue ? <Pill tone="red">Review due</Pill> : i.nextConsultantReviewAt ? <span className="text-muted-foreground">{fmtInTz(i.nextConsultantReviewAt, i.timezone)}</span> : <Nil label="No review scheduled" />}</td>
                <td className="wl-cell px-3">
                  <div className="flex items-center justify-end gap-1.5">
                    {chart && <Link href={"/patients/" + i.patientId} className="inline-flex h-8 items-center gap-1 rounded-full border border-input bg-card px-3 text-xs font-medium hover:bg-secondary" data-testid={"link-cocm-chart-" + i.patientId}><FolderOpen className="h-3.5 w-3.5" strokeWidth={1.6} />Chart</Link>}
                    {canTime && <ConfirmButton size="sm" variant="ghost" label="Timer" icon={<Timer className="h-3.5 w-3.5" strokeWidth={1.6} />} title={"Start BHI timer · " + i.patientName} desc="Starts a BHI care coordination timer under your name. Stop it from the timer bar when you finish." confirmLabel="Start timer" pending={pending} onConfirm={(_, close) => run({ action: "startTimer", patientId: i.patientId, program: "BHI", payload: { activity: "care_coordination" } }, close)} testid={"button-cocm-timer-" + i.patientId} />}
                    <ConsultantReviewButton i={i} eligible={canReview} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
