import {createHash} from "node:crypto";
import {type RecordRow} from "@workspace/db";
import {addRecord,allRecords,getRecord,type Actor,type Store} from "./store";
import {AppError} from "./errors";
import {educationBody,educationAvailable} from "./content-review";

export function educationContent(r:RecordRow) {
  return {id:r.id,title:r.title,description:r.description,program:r.program,
    version:String(r.metadata.contentVersion??"1"),body:educationBody(r.metadata),sourceRef:typeof r.metadata.sourceRef==="string"?r.metadata.sourceRef:"",
    url:typeof r.metadata.url==="string"?r.metadata.url:"",type:typeof r.metadata.type==="string"?r.metadata.type:"education"};
}
export function educationHash(r:RecordRow) {return createHash("sha256").update(JSON.stringify(educationContent(r))).digest("hex");}
export async function acknowledgeEducation(s:Store,actor:Actor,patientId:string,id:string,payload:Record<string,unknown>) {
  const material=await getRecord(s,id,"education");
  if(!educationAvailable(material)||(material.patientId&&material.patientId!==patientId))throw new AppError(409,"This learning material is not available to this patient");
  if(material.program&&!(await allRecords(s,"enrollments")).some(r=>r.patientId===patientId&&r.program===material.program&&r.status==="active"))throw new AppError(409,"This learning material is outside the patient's active programs");
  if(payload.acknowledged!==true)throw new AppError(400,"Confirm that the learning material was reviewed");
  const hash=educationHash(material);
  if(payload.contentHash!==hash)throw new AppError(409,"The learning material changed. Read the current version before acknowledging it.");
  const prior=(await allRecords(s,"tasks")).find(r=>r.patientId===patientId&&r.metadata.kind==="education_acknowledgment"&&r.metadata.educationHash===hash);
  if(prior)return prior;
  return addRecord(s,"tasks",{title:`Reviewed learning: ${material.title}`,patientId,program:material.program,status:"completed",
    description:"Acknowledgment of the displayed material, not proof of comprehension, exercise completion or billable education time.",
    metadata:{kind:"education_acknowledgment",audience:"patient",educationId:material.id,educationHash:hash,contentVersion:educationContent(material).version,contentSnapshot:educationContent(material),
      acknowledgedById:actor.id,acknowledgedBy:actor.name,acknowledgedAt:new Date().toISOString(),method:actor.role==="patient"?"patient_self_attestation":"staff_documentation"}},actor);
}
