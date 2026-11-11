import type {RecordRow} from "@workspace/db";
import type {Rulepack} from "./program-policy-schema";
/** Shared by billing and risk rules so the warning cannot count a different source population. */
export function isCountedMonitoring(r:RecordRow,program:string,policy:Rulepack) {
  if(r.metadata.valid===false) return false;
  if(program==="RPM") return policy.data_counted.includes("device")&&r.kind==="observations"&&r.metadata.source==="device"&&r.metadata.deviceCleared===true;
  const source=["app","patient_reported"].includes(String(r.metadata.source))||r.kind==="responses"||r.metadata.adherenceKind?"patient_reported":String(r.metadata.source);
  if(!policy.data_counted.includes(source as "device"|"patient_reported"|"clinician")) return false;
  const stream=r.metadata.adherenceKind?"adherence":r.kind==="responses"?r.metadata.instrument==="pain_nrs"?"pain":["odi","pgic"].includes(String(r.metadata.instrument))?"function":null:r.metadata.loinc==="72514-3"?"pain":String(r.metadata.therapeuticStream??"");
  return program==="RTM"&&policy.therapeutic_streams.includes(stream as "pain"|"function"|"adherence"|"therapeutic_device")&&(r.kind!=="tasks"||["completed","skipped"].includes(r.status));
}
