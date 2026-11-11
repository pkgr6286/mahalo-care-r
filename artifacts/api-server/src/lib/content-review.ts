import {createHash} from "node:crypto";
import {type RecordRow} from "@workspace/db";
import {type Actor} from "./store";
import {AppError} from "./errors";
type ContentInput={title?:string;description?:string;program?:string|null;metadata?:Record<string,unknown>};
export function educationBody(m:Record<string,unknown>) {
  return [m.body,m.content,m.text].find((v):v is string=>typeof v==="string"&&v.length>0)??"";
}
export function educationReviewHash(r:ContentInput) {
  const m=r.metadata??{};
  return createHash("sha256").update(JSON.stringify({title:r.title??"",description:r.description??"",program:r.program??null,
    body:educationBody(m),version:String(m.contentVersion??"1"),sourceRef:m.sourceRef??"",licenseNote:m.licenseNote??"",
    url:m.url??"",type:m.type??"education",nonClinical:m.nonClinical===true})).digest("hex");
}
export function educationAvailable(r:ContentInput&{status?:string}) {
  const m=r.metadata??{},body=educationBody(m).trim();
  let link=false;
  try{const url=new URL(String(m.url??""));link=url.protocol==="https:"&&!url.username&&!url.password;}catch{}
  if(r.status!=="active"||(!body&&!link))return false;
  return m.nonClinical===true||!!body&&m.contentApprovedForUse===true&&m.contentReviewHash===educationReviewHash(r)&&
    typeof m.sourceRef==="string"&&!!m.sourceRef.trim()&&typeof m.licenseNote==="string"&&m.licenseNote.trim().length>=20;
}
export function instrumentContentHash(r:ContentInput) {
  const m=r.metadata??{};
  return createHash("sha256").update(JSON.stringify({title:r.title??"",description:r.description??"",program:r.program??null,key:m.key,questions:m.questions??[],version:m.contentVersion??"1",sourceRef:m.sourceRef??"",licenseNote:m.licenseNote??""})).digest("hex");
}
export function instrumentAvailable(r:ContentInput&{status?:string}) {
  const m=r.metadata??{};
  if(r.status!=="active"||(m.questions!==undefined&&!Array.isArray(m.questions)))return false;
  if(!Array.isArray(m.questions)||!m.questions.length)return true; // Explicit synthetic placeholder mode.
  return m.contentApprovedForUse===true&&m.contentReviewHash===instrumentContentHash(r)&&typeof m.sourceRef==="string"&&!!m.sourceRef.trim()&&
    typeof m.licenseNote==="string"&&m.licenseNote.trim().length>=20;
}
/** Approval belongs to this exact content and the authenticated reviewer, never a client-supplied identity. */
export function reviewedContentMetadata(kind:string,input:ContentInput,actor:Actor,old?:RecordRow) {
  if(!["education","instruments"].includes(kind))return input.metadata;
  const m={...old?.metadata,...input.metadata},current={title:input.title??old?.title??"",description:input.description??old?.description??"",program:input.program===undefined?old?.program??null:input.program,metadata:m};
  if(m.contentVersion!==undefined&&(typeof m.contentVersion!=="string"&&typeof m.contentVersion!=="number"||!String(m.contentVersion).trim()||String(m.contentVersion).length>80||typeof m.contentVersion==="number"&&(!Number.isInteger(m.contentVersion)||m.contentVersion<1)))throw new AppError(400,"Content version must be a short nonblank string or positive integer");
  const fingerprint=kind==="education"?educationReviewHash:instrumentContentHash;
  const hash=fingerprint(current),changed=!old||hash!==fingerprint(old)||input.metadata?.contentApprovedForUse===false||
    old.metadata.contentApprovedForUse===true&&old.metadata.contentReviewHash!==fingerprint(old),confirmed=input.metadata?.contentApprovedForUse===true;
  if(confirmed&&(!old||changed||old.metadata.contentApprovedForUse!==true)) {
    if(typeof m.sourceRef!=="string"||!m.sourceRef.trim()||typeof m.licenseNote!=="string"||m.licenseNote.trim().length<20)throw new AppError(400,"Local content review requires the source and a license/use note of at least 20 characters");
    return {...m,contentApprovedForUse:true,contentReviewedById:actor.id,contentReviewedBy:actor.name,contentReviewedAt:new Date().toISOString(),contentReviewHash:hash};
  }
  return {...m,contentApprovedForUse:changed?false:old?.metadata.contentApprovedForUse===true,
    contentReviewedById:changed?null:old?.metadata.contentReviewedById??null,contentReviewedBy:changed?null:old?.metadata.contentReviewedBy??null,
    contentReviewedAt:changed?null:old?.metadata.contentReviewedAt??null,contentReviewHash:changed?null:old?.metadata.contentReviewHash??null};
}
