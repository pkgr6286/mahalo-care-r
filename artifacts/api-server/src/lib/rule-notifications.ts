import type {RecordRow} from "@workspace/db";
import type {ClinicalRule} from "./clinical-rule-schema";
import {addRecord,now,type Store,type Actor} from "./store";
export async function notifyRuleMatch(s:Store,actor:Actor,exception:RecordRow,rule:ClinicalRule,force=false) {
  const last=Date.parse(String(exception.metadata.lastNotifiedAt??"")),quietUntil=Number.isFinite(last)?last+rule.notify.quiet_period_minutes*60000:0;
  if(Date.now()<quietUntil&&!(force&&exception.severity==="critical"&&rule.notify.critical_bypass_quiet)) return {notificationSuppressedAt:now(),notificationQuietUntil:new Date(quietUntil).toISOString(),notificationSuppressedCount:Number(exception.metadata.notificationSuppressedCount??0)+1};
  const channels=new Set(rule.notify.channels);
  if(exception.severity==="critical"&&rule.notify.on_call_role) channels.add("sms");
  for(const channel of channels) await addRecord(s,"notifications",{
    patientId:exception.patientId,program:exception.program,title:"A patient needs attention in Mahalo Care",status:"pending",
    description:"A patient needs attention in Mahalo Care",assignee:exception.assignee,
    metadata:{audience:"staff",sourceRecordId:exception.id,ruleId:exception.metadata.ruleId,driver:"console",channel,containsClinicalContent:false,deliveredExternally:false,recipientRole:channel==="sms"&&exception.severity==="critical"?rule.notify.on_call_role??exception.metadata.ownerRole??rule.owner_role:exception.metadata.ownerRole??rule.owner_role,recipientUserId:channel==="sms"&&exception.severity==="critical"&&rule.notify.on_call_role?null:exception.metadata.ownerUserId??null,deepLink:`/patients/${exception.patientId}`},
  },actor);
  return channels.size?{lastNotifiedAt:now(),notificationQuietUntil:null,notificationCount:Number(exception.metadata.notificationCount??0)+channels.size}:{notificationSuppressedAt:now(),notificationSuppressedReason:"No notification channels configured"};
}
