import {createHash} from "node:crypto";
import {z} from "zod";
import type {RecordRow} from "@workspace/db";
import {AppError} from "./errors";
import {assessNumericText,editMetrics,type NumericEvidence} from "./ai-quality";
export function checkAiDraftText(r:RecordRow,text:string) {
  const evidence=r.metadata.numericEvidence as NumericEvidence|undefined;
  return evidence?.version===1&&Array.isArray(evidence.facts)?assessNumericText(text,evidence):{status:"unavailable",recognizedClaims:0,supportedClaims:0,unsupported:[],scope:"This legacy draft has no frozen numeric evidence; human verification is required."};
}
export function reviewAiDraft(r:RecordRow,payload:Record<string,unknown>) {
  if(payload.reviewConfirmed!==true) throw new AppError(400,"Explicitly confirm human review before accepting an AI draft");
  const text=z.string().min(1).max(18000).refine(value=>value.trim().length>0,"Review text cannot be blank").parse(payload.finalText??r.description);
  const numericCheck=checkAiDraftText(r,text);
  let numericOverrideReason:string|undefined;
  if(numericCheck.unsupported.length) {
    const parsed=z.string().trim().min(20).max(2000).safeParse(payload.numericOverrideReason);
    if(!parsed.success) throw new AppError(400,"Edit unsupported numeric claims or document a human verification reason of at least 20 characters");
    numericOverrideReason=parsed.data;
  }
  return {text,metadata:{...editMetrics(r.description,text),reviewedText:text,acceptedTextHash:createHash("sha256").update(text).digest("hex"),acceptedTextLength:text.length,acceptanceNumericCheck:numericCheck,numericOverrideReason:numericOverrideReason??null,humanReviewConfirmed:true}};
}
