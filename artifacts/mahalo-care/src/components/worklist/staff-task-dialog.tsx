import { useState } from "react";
import { Plus } from "lucide-react";
import { useListPatients, getListPatientsQueryKey, type WorklistPageOptions } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Field, inputCls } from "@/components/kit";
import { PROGRAMS, useSaveRecord } from "@/lib/api";
import { roleLabel } from "@/pages/account";
import { CLINICAL_ASSIGNEE_ROLES } from "@/lib/worklist";

export function NewStaffTask({ options }: { options?: WorklistPageOptions }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", patientId: "", program: "", due: "", assigneeId: "", description: "" });
  const patients = useListPatients(undefined, { query: { enabled: open, queryKey: getListPatientsQueryKey() } });
  const { save, pending } = useSaveRecord();
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const people = (options?.assignees ?? []).filter((a) => CLINICAL_ASSIGNEE_ROLES.includes(a.role));
  const who = people.find((a) => a.id === f.assigneeId);
  const dueIso = f.due ? new Date(f.due).toISOString() : "";
  const valid = f.title.trim().length > 0 && !!f.patientId && !!dueIso;
  const submit = () => save("tasks", {
    title: f.title.trim(), patientId: f.patientId, program: f.program || null, status: "pending", description: f.description.trim(),
    assignee: who?.name ?? "", date: dueIso,
    metadata: { audience: "staff", dueAt: dueIso, ...(who ? { ownerUserId: who.id, ownerRole: who.role, assignmentSource: "manual" } : {}) },
  }, undefined, () => { setOpen(false); setF({ title: "", patientId: "", program: "", due: "", assigneeId: "", description: "" }); });
  return (
    <>
      <Btn variant="primary" onClick={() => setOpen(true)} data-testid="button-new-staff-task"><Plus className="h-4 w-4" />New staff task</Btn>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New staff task</DialogTitle><DialogDescription>Visible to the care team only, not in the patient app.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Task" className="sm:col-span-2"><input className={inputCls} value={f.title} onChange={(e) => set({ title: e.target.value })} data-testid="input-task-title" /></Field>
            <Field label="Patient" className="sm:col-span-2">
              <select className={inputCls} value={f.patientId} onChange={(e) => set({ patientId: e.target.value })} data-testid="select-task-patient">
                <option value="">{patients.isLoading ? "Loading patients…" : "Select patient"}</option>
                {(patients.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.lastName}, {p.firstName} · {p.mrn}</option>)}
              </select>
            </Field>
            <Field label="Program"><select className={inputCls} value={f.program} onChange={(e) => set({ program: e.target.value })} data-testid="select-task-program"><option value="">None</option>{PROGRAMS.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Due" hint="Your local time; saved as an exact time"><input type="datetime-local" className={inputCls} value={f.due} onChange={(e) => set({ due: e.target.value })} data-testid="input-task-due" /></Field>
            <Field label="Assignee" className="sm:col-span-2">
              <select className={inputCls} value={f.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })} data-testid="select-task-assignee">
                <option value="">Unassigned</option>{people.map((a) => <option key={a.id} value={a.id}>{a.name} · {roleLabel(a.role)}</option>)}
              </select>
            </Field>
            <Field label="Details" className="sm:col-span-2"><input className={inputCls} value={f.description} onChange={(e) => set({ description: e.target.value })} data-testid="input-task-description" /></Field>
          </div>
          <DialogFooter>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" disabled={!valid || pending} onClick={submit} data-testid="button-save-task">{pending ? "Saving…" : "Create task"}</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
