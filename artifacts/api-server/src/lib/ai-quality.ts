import type {RecordRow} from "@workspace/db";
import {distance} from "fastest-levenshtein";
type Source=Pick<RecordRow,"id"|"kind"|"status"|"value"|"unit"|"metadata">;
type Fact={kind:"quantity"|"blood_pressure"|"score"|"count";value:number;secondary?:number;unit:string;sourceIds:string[]};
export type NumericEvidence={version:1;scope:string;facts:Fact[]};
const unit=(s:string)=>{
  const x=s.toLowerCase().replace(/\s/g,"");
  return ({minute:"min",minutes:"min",mins:"min",hour:"h",hours:"h",hr:"h",hrs:"h",second:"s",seconds:"s",sec:"s",secs:"s",pounds:"lb",lbs:"lb",kilograms:"kg",points:"score",point:"score"} as Record<string,string>)[x]??x;
};
const number=(s:string)=>s.includes("/")?Number(s.split("/")[0])/Number(s.split("/")[1]):Number(s.replaceAll(",",""));
function claims(text:string):Array<Fact&{text:string}> {
  const out:Array<Fact&{text:string}>=[];
  for(const m of text.matchAll(/(-?(?:\d+\/\d+|\d+(?:,\d{3})*(?:\.\d+)?))\s*(mm\s*hg|mg\/dl|mmol\/l|bpm|kg|kilograms|lbs?|pounds|%|minutes?|mins?|hours?|hrs?|seconds?|secs?|mcg|mg|ml|cm|points?)\b/gi)) {
    const u=unit(m[2]);if(u==="mmhg"&&m[1].includes("/"))continue;
    out.push({kind:"quantity",value:number(m[1]),unit:u,sourceIds:[],text:m[0]});
  }
  // A percentage followed by punctuation/end has no word boundary after '%'.
  for(const m of text.matchAll(/(-?\d+(?:\.\d+)?)\s*%(?!\w)/g)) out.push({kind:"quantity",value:Number(m[1]),unit:"%",sourceIds:[],text:m[0]});
  for(const m of text.matchAll(/\b(\d{2,3})\s*\/\s*(\d{2,3})(?:\s*(mm\s*hg))?/gi)) {
    if(!m[3]&&!/\b(?:bp|blood pressure)\s*(?:is|of|:|=)?\s*$/i.test(text.slice(Math.max(0,m.index!-30),m.index)))continue;
    out.push({kind:"blood_pressure",value:Number(m[1]),secondary:Number(m[2]),unit:"mmhg",sourceIds:[],text:m[0]});
  }
  for(const m of text.matchAll(/\b(PHQ[-\s]?9|GAD[-\s]?7)\s*(?:score\s*)?(?:is|of|:|=)?\s*(\d+(?:\.\d+)?)/gi)) out.push({kind:"score",value:Number(m[2]),unit:m[1].toLowerCase().replace(/[-\s]/g,""),sourceIds:[],text:m[0]});
  for(const m of text.matchAll(/\b(\d+)\s+(valid\s+)?observations?\b/gi)) out.push({kind:"count",value:Number(m[1]),unit:"valid_observations",sourceIds:[],text:m[0]});
  for(const m of text.matchAll(/\b(\d+)\s+(?:open|unresolved)\s+exceptions?\b/gi)) out.push({kind:"count",value:Number(m[1]),unit:"open_exceptions",sourceIds:[],text:m[0]});
  return out.filter(f=>Number.isFinite(f.value));
}
export function buildNumericEvidence(records:Source[],medications:string[]=[]):NumericEvidence {
  const facts:Fact[]=[];
  const observations=records.filter(r=>r.kind==="observations"&&r.metadata.valid!==false);
  const times=records.filter(r=>r.kind==="time"&&r.status==="committed");
  const exceptions=records.filter(r=>r.kind==="exceptions"&&["open","acknowledged"].includes(r.status));
  for(const r of records) {
    if((r.kind==="observations"&&r.metadata.valid!==false)||(r.kind==="time"&&["committed","stopped"].includes(r.status))||r.kind==="responses") {
      facts.push({kind:"quantity",value:r.value,unit:unit(r.unit),sourceIds:[r.id]});
      if(unit(r.unit)==="mmhg"&&typeof r.metadata.diastolic==="number") facts.push({kind:"blood_pressure",value:r.value,secondary:r.metadata.diastolic,unit:"mmhg",sourceIds:[r.id]},{kind:"quantity",value:r.metadata.diastolic,unit:"mmhg",sourceIds:[r.id]});
      if(r.kind==="responses"&&typeof r.metadata.instrument==="string") facts.push({kind:"score",value:r.value,unit:r.metadata.instrument.toLowerCase().replace(/[-\s]/g,""),sourceIds:[r.id]});
    }
  }
  for(const medication of medications) for(const f of claims(medication)) if(f.kind==="quantity") facts.push({...f,sourceIds:["patient:medication_list"]});
  facts.push({kind:"quantity",value:times.reduce((n,r)=>n+r.value,0),unit:"min",sourceIds:times.map(r=>r.id)},{kind:"count",value:observations.length,unit:"valid_observations",sourceIds:observations.map(r=>r.id)},{kind:"count",value:exceptions.length,unit:"open_exceptions",sourceIds:exceptions.map(r=>r.id)});
  return {version:1,scope:"Recognized quantities in the frozen supplied sources only; not complete factual or clinical validation.",facts};
}
export function assessNumericText(text:string,evidence:NumericEvidence) {
  const found=claims(text);
  const normalized=(f:Fact)=>f.kind==="quantity"&&["h","s"].includes(f.unit)?{...f,value:f.unit==="h"?f.value*60:f.value/60,unit:"min"}:f;
  const unsupported=found.filter(raw=>{const c=normalized(raw);return !evidence.facts.some(rawFact=>{const f=normalized(rawFact);return f.kind===c.kind&&f.unit===c.unit&&Math.abs(f.value-c.value)<=0.005&&(c.secondary===undefined||f.secondary!==undefined&&Math.abs(f.secondary-c.secondary)<=0.005);});}).map(f=>({claim:f.text,reason:"No matching recorded quantity was found in the frozen source evidence."}));
  return {version:1,status:unsupported.length?"needs_review":found.length?"checked":"no_numeric_claims",recognizedClaims:found.length,supportedClaims:found.length-unsupported.length,unsupported,scope:evidence.scope};
}
export function editMetrics(original:string,finalText:string) {
  const editDistance=distance(original,finalText);
  return {edited:editDistance>0,editDistance,editRatio:editDistance/Math.max(original.length,finalText.length,1)};
}
