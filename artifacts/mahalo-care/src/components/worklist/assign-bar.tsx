import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserRoundCheck, X } from "lucide-react";
import { useAssignWorklistRecords, type WorklistPageOptions } from "@workspace/api-client-react";
import { Btn } from "@/components/kit";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/api";
import { roleLabel } from "@/pages/account";
import { eligibleAssignees } from "@/lib/worklist";

const NONE = "__unassign";
export function AssignBar({ ids, kinds, options, onDone, onClear }: { ids: string[]; kinds: { clinical: boolean; device: boolean }; options?: WorklistPageOptions; onDone: () => void; onClear: () => void }) {
  const people = eligibleAssignees(options?.assignees ?? [], kinds);
  const [to, setTo] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = useAssignWorklistRecords();
  const go = () => {
    if (!to || !ids.length) return;
    m.mutate({ data: { ids: ids.slice(0, 100), assigneeId: to === NONE ? null : to } }, {
      onSuccess: (r) => { qc.invalidateQueries(); toast({ title: r.success ? "Reassigned" : "Not reassigned", description: r.count + " record" + (r.count === 1 ? "" : "s") + " updated" }); setTo(""); onDone(); },
      onError: (e) => toast({ title: "Reassignment failed", description: errMsg(e) + " No records were changed.", variant: "destructive" }),
    });
  };
  return (
    <div className="rise sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--brand-charcoal))]/20 bg-[hsl(var(--brand-charcoal))] px-3 py-2 text-[hsl(var(--background))] shadow-[var(--shadow-lg)]" role="region" aria-label="Bulk assignment" data-testid="bar-assign">
      <span className="tnum text-sm font-medium">{ids.length} selected</span>
      <span className="text-xs opacity-70">on this page</span>
      <select aria-label="Assign to" className="ml-auto h-8 min-w-[12rem] rounded-lg border border-white/20 bg-white/10 px-2 text-sm text-inherit [&>option]:text-foreground" value={to} onChange={(e) => setTo(e.target.value)} data-testid="select-assign-to">
        <option value="">Assign to…</option>
        <option value={NONE}>Unassigned</option>
        {people.map((a) => <option key={a.id} value={a.id}>{a.name} · {roleLabel(a.role)}</option>)}
      </select>
      {kinds.clinical && kinds.device && <span className="text-[11px] opacity-70">Mixed selection: showing staff eligible for both</span>}
      <Btn size="sm" variant="primary" disabled={!to || (to !== NONE && !people.some((p) => p.id === to)) || m.isPending} onClick={go} data-testid="button-assign"><UserRoundCheck className="h-3.5 w-3.5" strokeWidth={1.6} />{m.isPending ? "Assigning…" : "Assign"}</Btn>
      <button type="button" onClick={onClear} className="rounded-full p-1.5 opacity-70 hover:opacity-100" aria-label="Clear selection" data-testid="button-clear-selection"><X className="h-4 w-4" strokeWidth={1.6} /></button>
    </div>
  );
}
