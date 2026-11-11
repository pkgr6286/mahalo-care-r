import {useState} from "react";
import {useListProgramPolicies,type CareRecord,type Patient} from "@workspace/api-client-react";
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Btn,Field,ErrorState,inputCls} from "@/components/kit";
import {PROGRAMS,useSaveRecord} from "@/lib/api";
import {ConflictNotice} from "@/components/draft-lifecycle";
import {isConflict} from "@/lib/record-lifecycle";

type Section={key:string;label:string;required:boolean};
const sectionsFrom=(value:unknown):Section[]=>Array.isArray(value)?value.filter((v):v is Section=>!!v&&typeof v==="object"&&typeof v.key==="string"&&typeof v.label==="string"&&typeof v.required==="boolean"):[];
export function NoteEditor({patient,record,onClose}:{patient:Patient;record:CareRecord|null;onClose:()=>void}) {
  const policies=useListProgramPolicies(),{save,pending}=useSaveRecord();
  const [startedAt]=useState(record?.updatedAt),[conflict,setConflict]=useState(false);
  const [program,setProgram]=useState(record?.program??patient.programs[0]??"CCM");
  const [title,setTitle]=useState(record?.title??"Care follow-up");
  const [description,setDescription]=useState(record?.description??"");
  const [templateId,setTemplateId]=useState(typeof record?.metadata?.templateId==="string"?record.metadata.templateId:"");
  const [values,setValues]=useState<Record<string,string>>(()=>record?.metadata?.sectionValues&&typeof record.metadata.sectionValues==="object"?record.metadata.sectionValues as Record<string,string>:{});
  const templates=(policies.data?.items??[]).filter(p=>p.kind==="note_template"&&p.program===program&&(p.status==="published"||p.id===templateId));
  const selected=templates.find(t=>t.id===templateId),sections=sectionsFrom(selected?.body.sections??record?.metadata?.templateSections);
  const signed=record?.status==="signed";
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}>
    <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>{signed?"Add a note addendum":record?"Edit draft note":"New clinical note"}</DialogTitle><DialogDescription>Saved as a draft. Required template sections must be complete before signing. Signed versions are preserved.</DialogDescription></DialogHeader>
      <div className="space-y-4">
        {conflict&&<ConflictNotice/>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title"><input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} data-testid="input-note-title"/></Field>
          <Field label="Program"><select className={inputCls} value={program} disabled={signed} onChange={e=>{setProgram(e.target.value as typeof program);setTemplateId("");setValues({});}} data-testid="select-note-program">{PROGRAMS.map(p=><option key={p}>{p}</option>)}</select></Field>
        </div>
        <Field label="Published note template" hint="A chosen template version stays attached to this note.">
          <select className={inputCls} value={templateId} disabled={policies.isLoading} onChange={e=>{setTemplateId(e.target.value);setValues({});}} data-testid="select-note-template">
            <option value="">Freeform note</option>
            {templates.map(t=><option key={t.id} value={t.id}>{typeof t.body.title==="string"?t.body.title:t.version} · {t.version}{t.status==="retired"?" · retained historical version":""}</option>)}
          </select>
        </Field>
        {policies.isError&&<ErrorState error={policies.error} onRetry={()=>policies.refetch()}/>}
        {templateId?sections.length?sections.map(section=><Field key={section.key} label={section.label} hint={section.required?"Required before signing":"Optional"}>
          <textarea rows={4} className={`${inputCls} h-auto py-2`} value={values[section.key]??""} onChange={e=>setValues({...values,[section.key]:e.target.value})} maxLength={12000} data-testid={`input-note-section-${section.key}`}/>
        </Field>):<p className="text-sm text-destructive">This template is unavailable. Refresh the policy list or choose another template.</p>:<Field label="Note body"><textarea rows={10} className={`${inputCls} h-auto py-2`} value={description} onChange={e=>setDescription(e.target.value)} data-testid="input-note-body"/></Field>}
      </div>
      <DialogFooter>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" disabled={pending||!title.trim()||(!!templateId&&!sections.length)} onClick={()=>save("notes",{title:title.trim(),patientId:patient.id,program,status:"draft",description,metadata:{...record?.metadata,templateId:templateId||null,sectionValues:templateId?values:{}}},record?.id,()=>onClose(),{expectedUpdatedAt:startedAt,onError:e=>setConflict(isConflict(e))})} data-testid="button-save-note">Save draft</Btn>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
