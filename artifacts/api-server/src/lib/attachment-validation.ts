import {createHash} from "node:crypto";
import {AppError} from "./errors";
export const ATTACHMENT_LIMIT=1024*1024;
export function validateIncomingAttachmentMetadata(size:unknown,encoding:unknown,declaredSize:number){
  if(encoding)throw new AppError(422,"Transport-encoded uploads are not accepted; upload the original raw PDF");
  const actual=Number(size);
  if(!Number.isSafeInteger(actual)||actual<1||actual>ATTACHMENT_LIMIT||actual!==declaredSize)throw new AppError(422,"The uploaded PDF exceeds or differs from its declared permitted size");
}
export function validateAttachmentFilename(value:string) {
  if(!value||value.length>120||value!==value.trim()||/[\/\\\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)||!value.toLowerCase().endsWith(".pdf"))
    throw new AppError(400,"Use a plain PDF filename of at most 120 characters without paths or control characters");
  return value;
}
/** Lightweight format/active-content checks only. This is explicitly NOT an antivirus or full PDF parser. */
export function validateSupportingPdf(bytes:Buffer,declaredSize:number) {
  if(!Number.isSafeInteger(declaredSize)||declaredSize<1||declaredSize>ATTACHMENT_LIMIT||bytes.length!==declaredSize)throw new AppError(422,"The uploaded size does not match the permitted PDF");
  if(!/^%PDF-(?:1\.[0-7]|2\.0)/.test(bytes.subarray(0,12).toString("latin1"))||!bytes.subarray(-2048).toString("latin1").trimEnd().endsWith("%%EOF"))
    throw new AppError(422,"The uploaded file does not have the expected PDF header and end marker");
  if(/\/(?:JavaScript|JS|Launch|RichMedia|EmbeddedFile|Encrypt|OpenAction|AA)\b/.test(bytes.toString("latin1")))throw new AppError(422,"Active, embedded or encrypted PDF features are not accepted");
  return createHash("sha256").update(bytes).digest("hex");
}
