import { type RecordRow } from "@workspace/db";
import { allRecords, addRecord, getPatientRow, type Store, type Actor, type RecordInput } from "./store";
import { AppError } from "./errors";

export async function ingestReading(s: Store, input: RecordInput, actor:Actor, trustedDevice=false) {
  const p=await getPatientRow(s,input.patientId||undefined);
  const at=new Date(input.date||Date.now());
  if(!Number.isFinite(at.getTime()) || at.getTime()>Date.now()+300000) throw new AppError(400,"Measured time is invalid or in the future");
  const metadata={...input.metadata};
  if(!trustedDevice&&metadata.source==="device") {metadata.source="clinician";metadata.deviceCleared=false;}
  const isBP=input.unit==="mmHg"&&metadata.loinc!=="8462-4";
  const systolic=Number(input.value), diastolic=Number(metadata.diastolic??80);
  if(!Number.isFinite(systolic)) throw new AppError(400,"A numeric reading is required");
  const rs=await allRecords(s);
  const duplicate=rs.find(r=>r.kind==="observations" && r.patientId===p.id && r.date===at.toISOString() && r.title===input.title&&r.metadata.deviceId===metadata.deviceId);
  if(duplicate) return duplicate;
  const ranges:Record<string,[number,number]>={"8480-6":[30,300],"8462-4":[20,200],"29463-7":[1,500],"2339-0":[20,600],"8867-4":[20,250],"59408-5":[0,100]};
  const range=ranges[String(metadata.loinc)]??(isBP?[30,300]:input.unit==="/10"?[0,10]:[-1e6,1e6]);
  const valid=systolic>=range[0]!&&systolic<=range[1]!&&(!isBP||diastolic>=20&&diastolic<=200);
  const observation=await addRecord(s,"observations",{...input,date:at.toISOString(),status:valid?"valid":"invalid",metadata:{...metadata,...(isBP?{diastolic}:{}),valid,invalidReason:valid?null:"Outside the configured plausible measurement range"}},actor);
  // Alert decisions belong to the configured rule engine, not an unrelated hardcoded threshold.
  return observation;
}

export function assertKind(record:RecordRow,kind:string) {
  if(record.kind!==kind) throw new AppError(400,`This action requires a ${kind} record`);
}
