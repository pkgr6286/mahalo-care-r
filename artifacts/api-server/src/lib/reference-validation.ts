import { AppError } from "./errors";
import { planItems } from "./task-schedules";
import type { RecordRow } from "@workspace/db";
import {parseClinicalRule} from "./clinical-rule-schema";
import {educationBody} from "./content-review";
import {instrumentDefinition} from "./instrument-scoring";

export function validateReference(kind:string,input:{status?:string;program?:string|null;metadata?:Record<string,unknown>}) {
  const m=input.metadata??{};
  if(kind==="interactions"&&["ehr_sync","ehr_match_pending"].includes(String(m.kind)))throw new AppError(400,"Refresh or confirm EHR context through its read-only identity workflow");
  if(kind==="education") {
    for(const key of ["body","content","text"])if(m[key]!==undefined&&m[key]!==null&&(typeof m[key]!=="string"||String(m[key]).length>20000))throw new AppError(400,"Learning text must be plain text of at most 20,000 characters");
    if(m.nonClinical!==undefined&&typeof m.nonClinical!=="boolean")throw new AppError(400,"Choose whether this is nonclinical application guidance");
    if(m.url!==undefined&&m.url!==null&&m.url!=="") {
      try{const url=new URL(String(m.url));if(typeof m.url!=="string"||url.protocol!=="https:"||url.username||url.password)throw new Error();}
      catch{throw new AppError(400,"Learning resources must use HTTPS without embedded credentials");}
    }
    if((input.status??"active")==="active") {
      if(!educationBody(m).trim()&&!m.url)throw new AppError(400,"Active learning material needs actual text or an HTTPS resource");
      if(m.nonClinical!==true&&(!educationBody(m).trim()||m.contentApprovedForUse!==true||typeof m.contentReviewHash!=="string"||
        typeof m.sourceRef!=="string"||!m.sourceRef.trim()||typeof m.licenseNote!=="string"||m.licenseNote.trim().length<20))throw new AppError(400,"Save clinical learning content as a draft, or explicitly review its local text, source and permitted use before activation");
    }
  }
  if(kind==="tasks"&&(m.kind==="education_acknowledgment"||m.source==="uncommitted_time"))throw new AppError(400,"Use the dedicated acknowledgment or time workflow for system-owned evidence");
  if(kind==="instruments") {
    if(typeof m.key!=="string"||!m.key.trim()||m.key.length>80)throw new AppError(400,"A questionnaire needs a short nonblank identifier.");
    const def=instrumentDefinition(m.key,m);
    if(Array.isArray(m.questions)&&m.questions.length&&m.contentApprovedForUse===true&&(typeof m.sourceRef!=="string"||!m.sourceRef.trim()||typeof m.licenseNote!=="string"||m.licenseNote.trim().length<20))throw new AppError(400,"Approved question wording requires its source and a local license/use review note of at least 20 characters");
    if((input.status??"active")==="active"&&def.config.method==="lookup") {
      const table=def.config.lookup??[],raw=new Set(table.map(r=>r.raw));
      if(!table.length||raw.size!==table.length)throw new AppError(400,"Activation requires a unique approved conversion table.");
      for(let n=def.count*def.range.min;n<=def.count*def.range.max;n++)if(!raw.has(n))throw new AppError(400,`The conversion table does not cover raw score ${n}. Complete the approved table before activation.`);
    }
  }
  if(kind==="interactions"&&m.kind==="consultant_review") throw new AppError(400,"Record consultant reviews through the qualified consultant workflow");
  if(kind==="tasks"&&m.dueAt!==undefined&&m.dueAt!==null) {
    const date=m.dueAt;
    if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:[.]\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(`${date.slice(0,10)}T12:00:00Z`).toISOString().slice(0,10)!==date.slice(0,10)) throw new AppError(400,"Task due time must be a valid ISO timestamp with a timezone");
  }
  if(kind==="rules"&&input.status!=="draft") {
    const definition=parseClinicalRule(m);
    if(input.program&&definition.program_key&&input.program!==definition.program_key) throw new AppError(400,"Rule program and program_key must match");
  }
  if(kind==="locations"&&m.timezone) try{new Intl.DateTimeFormat("en",{timeZone:String(m.timezone)});}catch{throw new AppError(400,"Enter a valid location timezone");}
  if(kind==="careplans"&&Array.isArray(m.items)) planItems({metadata:m} as RecordRow);
}
