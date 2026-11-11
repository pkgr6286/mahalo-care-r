import type {RecordRow} from "@workspace/db";
import {allRecords,type Actor,type Store} from "./store";
import {captureDocument,captureDocuments} from "./document-store";
export async function captureWorkflowDocuments(s:Store,actor:Actor,action:string,result:{record?:RecordRow;records?:RecordRow[]}) {
  if(["signPlan","signNote"].includes(action)&&result.record) await captureDocument(s,actor,result.record,"signature",`signature:${result.record.metadata.signedAt}`);
  if(action==="enroll"&&result.record) {
    const consents=(await allRecords(s,"consents")).filter(r=>r.metadata.enrollmentId===result.record!.id);
    for(const r of consents) await captureDocument(s,actor,r,"consent_capture","consent_capture");
  }
  if(action==="revokeConsent"&&result.record) await captureDocument(s,actor,result.record,"consent_revocation",`revocation:${result.record.updatedAt.toISOString()}`);
  if(action==="closePeriod") await captureDocuments(s,actor,(result.records??[]).filter(r=>r.kind==="billing"&&r.metadata.closed===true).map(r=>({record:r,origin:"billing_close",eventKey:`close:${r.metadata.period}:${r.metadata.closedAt}`})));
  if(["approveLine","rejectLine","bulkApproveLines"].includes(action))await captureDocuments(s,actor,(result.records??(result.record?[result.record]:[])).filter(r=>r.kind==="billing"&&r.metadata.closed===true).map(r=>({record:r,origin:"billing_review",eventKey:`review:${r.status}:${r.metadata.decidedAt}`})));
}
