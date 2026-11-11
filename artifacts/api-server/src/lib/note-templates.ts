import {eq} from "drizzle-orm";
import {programPolicies,type RecordRow} from "@workspace/db";
import {NoteTemplateSchema} from "./program-policy-schema";
import {policyHash} from "./program-policies";
import {AppError} from "./errors";
import type {RecordInput,Store} from "./store";

export async function prepareTemplatedNote(s:Store,input:RecordInput,current?:RecordRow) {
  const metadata=input.metadata??{},templateId=metadata.templateId;
  if(typeof templateId!=="string"||!templateId) return input;
  const [row]=await s.select().from(programPolicies).where(eq(programPolicies.id,templateId));
  if(!row||row.kind!=="note_template"||row.program!==input.program||!["published","retired"].includes(row.status)) throw new AppError(400,"Select a published note template for this program");
  if(row.status==="retired"&&current?.metadata.templateId!==templateId) throw new AppError(400,"A retired template is retained for existing notes, not new notes");
  const template=NoteTemplateSchema.parse(row.body),values=metadata.sectionValues;
  if(!values||typeof values!=="object"||Array.isArray(values)) throw new AppError(400,"Structured note section values are required");
  const sectionValues=values as Record<string,unknown>;
  if(Object.keys(sectionValues).some(key=>!template.sections.some(s=>s.key===key))||Object.values(sectionValues).some(v=>typeof v!=="string"||v.length>12000)) throw new AppError(400,"Note sections must match the selected template");
  return {...input,description:template.sections.map(section=>`${section.label}\n${sectionValues[section.key]??""}`).join("\n\n"),metadata:{...metadata,templateId:row.id,templateVersion:row.version,templateHash:policyHash(row.body),templateSections:template.sections}};
}
export async function assertNoteForSigning(s:Store,note:RecordRow) {
  if(!note.metadata.templateId) return;
  const normalized=await prepareTemplatedNote(s,{title:note.title,patientId:note.patientId,program:note.program,metadata:note.metadata},note);
  const sections=normalized.metadata!.templateSections as {key:string;label:string;required:boolean}[],values=note.metadata.sectionValues as Record<string,string>;
  const missing=sections.filter(section=>section.required&&!String(values[section.key]??"").trim());
  if(missing.length) throw new AppError(400,`Complete required note sections: ${missing.map(s=>s.label).join(", ")}`);
}
