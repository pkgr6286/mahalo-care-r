import type { PatientRow, RecordRow } from "@workspace/db";

export type FhirResource = {resourceType:string;id:string;[key:string]:unknown};
export type EhrIdentity = {id:string;mrn?:string;firstName:string;lastName:string;dob:string};
export function matchEhrPatient(patient:Pick<PatientRow,"mrn"|"firstName"|"lastName"|"dob">,candidates:EhrIdentity[]) {
  const exact=candidates.filter(c=>c.mrn===patient.mrn);
  if(exact.length===1) return {status:"matched",matchedBy:"mrn",candidate:exact[0]};
  if(exact.length>1) return {status:"ambiguous",matchedBy:null,candidate:null};
  const normalize=(s:string)=>s.trim().toLowerCase();
  const nameDob=candidates.filter(c=>normalize(c.firstName)===normalize(patient.firstName)&&normalize(c.lastName)===normalize(patient.lastName)&&c.dob===patient.dob);
  return {status:nameDob.length===1?"confirmation_required":nameDob.length>1?"ambiguous":"unmatched",matchedBy:null,candidate:nameDob.length===1?nameDob[0]:null};
}

export interface EhrAdapter {
  readonly driver:string;
  read(patient:PatientRow,records:RecordRow[]):Promise<{identity:EhrIdentity;resources:FhirResource[]}>;
}
/** Local FHIR R4 fixture driver. No vendor network request, write-back or silent live fallback. */
export const fixtureEhrAdapter:EhrAdapter={
  driver:"fhir_fixture",
  async read(patient,records) {
    const patientId=`fixture-${patient.id}`,subject={reference:`Patient/${patientId}`};
    const identity:EhrIdentity={id:patientId,mrn:patient.mrn,firstName:patient.firstName,lastName:patient.lastName,dob:patient.dob};
    const resources:FhirResource[]=[{
      resourceType:"Patient",id:patientId,active:patient.status==="active",identifier:[{system:"https://example.test/synthetic-mrn",value:patient.mrn}],
      name:[{family:patient.lastName,given:[patient.firstName]}],birthDate:patient.dob,
    }];
    patient.conditions.forEach((condition,i)=>resources.push({
      resourceType:"Condition",id:`condition-${i}`,subject,clinicalStatus:{coding:[{system:"http://terminology.hl7.org/CodeSystem/condition-clinical",code:"active"}]},code:{text:condition},
    }));
    patient.medications.forEach((medication,i)=>resources.push({
      resourceType:"MedicationRequest",id:`medication-${i}`,subject,status:"active",intent:"order",medicationCodeableConcept:{text:medication},
    }));
    records.filter(r=>r.patientId===patient.id&&r.kind==="observations"&&r.metadata.valid!==false).slice(0,20).forEach(r=>resources.push({
      resourceType:"Observation",id:`observation-${r.id}`,subject,status:"final",effectiveDateTime:r.date,
      code:{text:r.title,...(r.metadata.loinc?{coding:[{system:"http://loinc.org",code:String(r.metadata.loinc)}]}:{})},
      valueQuantity:{value:r.value,unit:r.unit},
    }));
    return {identity,resources};
  },
};
