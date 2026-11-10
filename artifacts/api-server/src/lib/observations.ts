import { type RecordRow } from "@workspace/db";
import { allRecords, addRecord, patchRecord, getPatientRow, type Store, type Actor, type RecordInput } from "./store";
import { AppError } from "./errors";

export async function ingestReading(s: Store, input: RecordInput, actor:Actor) {
  const p=await getPatientRow(s,input.patientId||undefined);
  const at=new Date(input.date||Date.now());
  if(!Number.isFinite(at.getTime()) || at.getTime()>Date.now()+300000) throw new AppError(400,"Measured time is invalid or in the future");
  const metadata=input.metadata||{};
  const systolic=Number(input.value), diastolic=Number(metadata.diastolic||80);
  if(!Number.isFinite(systolic)) throw new AppError(400,"A numeric reading is required");
  const rs=await allRecords(s);
  const duplicate=rs.find(r=>r.kind==="observations" && r.patientId===p.id && r.date===at.toISOString() && r.title===input.title);
  if(duplicate) return duplicate;
  const valid=systolic>=30 && systolic<=300 && diastolic>=20 && diastolic<=200;
  const observation=await addRecord(s,"observations",{...input,date:at.toISOString(),status:valid?"valid":"invalid",metadata:{...metadata,diastolic,valid,invalidReason:valid?null:"Outside plausible physiologic range"}},actor);
  if(valid) {
    const rules=rs.filter(r=>r.kind==="rules" && r.status==="active" && r.metadata.kind==="threshold" && (!r.program||r.program===input.program));
    const threshold=Number(rules[0]?.metadata.threshold||180);
    if(systolic>=threshold || diastolic>=120) {
      const open=rs.find(r=>r.kind==="exceptions" && r.patientId===p.id && ["open","acknowledged"].includes(r.status) && r.metadata.ruleKey==="bp_critical");
      if(open) await patchRecord(s,open,{value:systolic,severity:"critical",metadata:{...open.metadata,signalCount:Number(open.metadata.signalCount||1)+1,lastSignalAt:at.toISOString()}},actor,"new_signal");
      else await addRecord(s,"exceptions",{patientId:p.id,program:input.program,title:"Blood pressure above critical threshold",status:"open",severity:"critical",value:systolic,unit:"mmHg",description:"Review the reading and follow the practice's clinician-approved escalation procedure.",metadata:{ruleKey:"bp_critical",signalCount:1,observationId:observation.id}},actor);
    }
  }
  return observation;
}

export function assertKind(record:RecordRow,kind:string) {
  if(record.kind!==kind) throw new AppError(400,`This action requires a ${kind} record`);
}
