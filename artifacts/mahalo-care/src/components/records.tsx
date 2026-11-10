import { Link } from "wouter";
import { Check, CheckCheck, CircleSlash, Eye } from "lucide-react";
import type { CareRecord } from "@workspace/api-client-react";
import { ConfirmButton, Pill, ProgramTag, StatusPill, toneFor } from "@/components/kit";
import { fmtRel, useAction } from "@/lib/api";
import { cn } from "@/lib/utils";

const sevBar: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-[hsl(14_85%_55%)]",
  medium: "bg-[hsl(38_90%_52%)]",
  low: "bg-[hsl(220_15%_70%)]",
};

export function isOpen(r: CareRecord) {
  return !["resolved", "dismissed", "completed", "done", "closed"].includes((r.status ?? "").toLowerCase());
}

export function ExceptionRow({ r, showPatient = true }: { r: CareRecord; showPatient?: boolean }) {
  const { run, pending } = useAction();
  const open = isOpen(r);
  return (
    <div className="group relative flex flex-col gap-3 border-b border-border py-3 pl-4 pr-1 last:border-b-0 sm:flex-row sm:items-center" data-testid={`row-exception-${r.id}`}>
      <span className={cn("absolute left-0 top-3 bottom-3 w-[3px] rounded-full", sevBar[(r.severity ?? "").toLowerCase()] ?? "bg-border")} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{r.title}</span>
          <ProgramTag p={r.program} />
          {r.severity && <Pill tone={toneFor(r.severity)}>{r.severity}</Pill>}
          <StatusPill value={r.status} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {showPatient && r.patientId && (
            <Link href={`/patients/${r.patientId}`} className="font-medium text-foreground hover:text-primary" data-testid={`link-patient-${r.id}`}>{r.patientName}</Link>
          )}
          {r.description && <span className="truncate max-w-[52ch]">{r.description}</span>}
          <span>{fmtRel(r.date ?? r.createdAt)}</span>
        </div>
      </div>
      {open && (
        <div className="flex shrink-0 items-center gap-1.5">
          {(r.status ?? "").toLowerCase() !== "acknowledged" && (
            <ConfirmButton label="Acknowledge" icon={<Eye className="h-3.5 w-3.5" />} title="Acknowledge exception" desc={`You are taking ownership of "${r.title}" for ${r.patientName}.`} confirmLabel="Acknowledge" pending={pending} onConfirm={(_, close) => run({ action: "acknowledge", id: r.id }, close)} testid={`button-ack-${r.id}`} />
          )}
          <ConfirmButton label="Resolve" icon={<Check className="h-3.5 w-3.5" />} title="Resolve exception" desc="Document the clinical response. This is recorded in the patient's timeline." reason reasonLabel="Resolution note" confirmLabel="Resolve" pending={pending} variant="primary" onConfirm={(reason, close) => run({ action: "resolve", id: r.id, reason }, close)} testid={`button-resolve-${r.id}`} />
          <ConfirmButton label="" icon={<CircleSlash className="h-3.5 w-3.5" />} title="Dismiss exception" desc="Dismissed exceptions stay in the audit trail with your reason." reason confirmLabel="Dismiss" pending={pending} variant="ghost" onConfirm={(reason, close) => run({ action: "dismiss", id: r.id, reason }, close)} testid={`button-dismiss-${r.id}`} />
        </div>
      )}
    </div>
  );
}

export function TaskRow({ r, showPatient = true }: { r: CareRecord; showPatient?: boolean }) {
  const { run, pending } = useAction();
  const open = isOpen(r);
  const overdue = open && r.date && new Date(r.date) < new Date(new Date().toDateString());
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0" data-testid={`row-task-${r.id}`}>
      <ConfirmButtonCheck done={!open} pending={pending} title={r.title} onConfirm={(close) => run({ action: "completeTask", id: r.id }, close)} id={r.id} />
      <div className="min-w-0 flex-1">
        <div className={cn("flex flex-wrap items-center gap-2 text-sm", !open && "text-muted-foreground line-through")}>
          {r.title} <ProgramTag p={r.program} />
        </div>
        <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {showPatient && r.patientId && <Link href={`/patients/${r.patientId}`} className="font-medium text-foreground hover:text-primary">{r.patientName}</Link>}
          {r.assignee && <span>{r.assignee}</span>}
          {r.date && <span className={cn(overdue && "font-medium text-destructive")}>{overdue ? "Overdue · " : "Due "}{new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
        </div>
      </div>
      <StatusPill value={r.status} />
    </div>
  );
}

function ConfirmButtonCheck({ done, pending, title, onConfirm, id }: { done: boolean; pending: boolean; title: string; onConfirm: (close: () => void) => void; id: string }) {
  if (done) {
    return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(162_55%_40%)] text-white"><CheckCheck className="h-3 w-3" /></span>;
  }
  return (
    <ConfirmButton
      label=""
      icon={<span className="block h-3.5 w-3.5 rounded-full border-[1.5px] border-current" />}
      variant="ghost"
      title="Complete task"
      desc={`Mark "${title}" as complete.`}
      confirmLabel="Complete"
      pending={pending}
      onConfirm={(_, close) => onConfirm(close)}
      testid={`button-complete-${id}`}
    />
  );
}

export function ActivityRow({ r }: { r: CareRecord }) {
  return (
    <div className="flex gap-3 py-2" data-testid={`row-activity-${r.id}`}>
      <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
      <div className="min-w-0 text-xs">
        <div className="text-foreground"><span className="font-medium">{r.title}</span>{r.patientName ? <span className="text-muted-foreground"> · {r.patientName}</span> : null}</div>
        <div className="text-muted-foreground">{r.kind} · {fmtRel(r.createdAt)}</div>
      </div>
    </div>
  );
}
