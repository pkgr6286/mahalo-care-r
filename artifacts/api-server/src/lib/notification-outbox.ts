import type {PatientRow} from "@workspace/db";
import {sql} from "drizzle-orm";
import {allRecords,patchRecord,type Store} from "./store";
import {systemActor} from "./device-ingestion";
import {nextAllowedNotificationAt} from "./communication-preferences";
export async function captureNotificationOutbox(s:Store,ps:PatientRow[],at=new Date(),targetId?:string) {
  await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
  let captured=0,suppressed=0,deferred=0;
  for(const n of (await allRecords(s,"notifications")).filter(r=>r.status==="pending"&&(!targetId||r.id===targetId))) {
    const p=ps.find(p=>p.id===n.patientId),channel=String(n.metadata.channel);
    const patientChannel=n.metadata.audience==="patient"&&p&&["email","sms","push"].includes(channel);
    const optedOut=patientChannel&&p.communicationPreferences[channel as "email"|"sms"|"push"]===false;
    if(patientChannel&&!optedOut&&p.communicationPreferences.quietHours?.enabled) {
      const quiet=p.communicationPreferences.quietHours,signature=JSON.stringify([p.timezone,quiet]);
      if(n.metadata.quietPeriodSignature===signature&&typeof n.metadata.deferredUntil==="string"&&Date.parse(n.metadata.deferredUntil)>at.getTime()){
        deferred++;continue;
      }
      const next=nextAllowedNotificationAt(at,p.timezone,quiet);
      if(next.getTime()>at.getTime()){
        await patchRecord(s,n,{metadata:{...n.metadata,driver:"console",deferredUntil:next.toISOString(),quietPeriodSignature:signature,deliveredExternally:false}},systemActor,"defer_patient_notification");
        deferred++;continue;
      }
    }
    await patchRecord(s,n,{status:optedOut?"suppressed":"captured",metadata:{...n.metadata,driver:"console",capturedAt:at.toISOString(),deliveredExternally:false,
      deferredUntil:null,quietPeriodSignature:null,...(optedOut?{suppressedReason:"Patient communication preference"}:{})}},systemActor,"capture");
    if(optedOut)suppressed++;else captured++;
  }
  return {captured,suppressed,deferred,delivery:"console_only"};
}
