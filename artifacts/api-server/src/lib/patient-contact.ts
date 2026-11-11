import type {RecordRow} from "@workspace/db";
type ContactRecord=Pick<RecordRow,"kind"|"status"|"metadata"|"date">;
export function latestPatientContact(rows:readonly ContactRecord[]){
  return rows.filter(r=>r.kind==="interactions"&&r.status==="completed"&&
    !["ehr_sync","ehr_match_pending"].includes(String(r.metadata.kind))&&
    r.metadata.simulated!==true&&r.metadata.driver!=="stub")
    .sort((a,b)=>b.date.localeCompare(a.date))[0]?.date??"";
}
