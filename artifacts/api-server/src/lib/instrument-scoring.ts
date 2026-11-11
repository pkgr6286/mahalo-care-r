import { z } from "zod";
import { AppError } from "./errors";

const scoringSchema=z.object({
  method:z.enum(["sum","mean","percentage","lookup"]),
  factor:z.number().finite().positive().max(100).optional(),
  lookup:z.array(z.object({raw:z.number().int(),score:z.number().finite()})).max(2000).optional(),
  bands:z.array(z.object({min:z.number().finite(),max:z.number().finite(),label:z.string().trim().min(1).max(80)})).max(30).optional(),
});
const standard:Record<string,{count:number;min:number;max:number;factor?:number}>={
  phq9:{count:9,min:0,max:3},gad7:{count:7,min:0,max:3},pain_nrs:{count:1,min:0,max:10},odi:{count:10,min:0,max:5,factor:2},pgic:{count:1,min:1,max:7},
};
export function instrumentDefinition(key:string,metadata:Record<string,unknown>) {
  const fallback=standard[key],questions=metadata.questions;
  if(questions!==undefined&&(!Array.isArray(questions)||questions.length>100||questions.some(q=>typeof q!=="string"||!q.trim()||q.length>2000)))throw new AppError(400,"Questionnaire items must be nonblank text, with at most 100 items.");
  const count=Array.isArray(questions)&&questions.length?questions.length:fallback?.count;
  const range=metadata.range?z.object({min:z.number().int().min(-100).max(100),max:z.number().int().min(-100).max(100)}).parse(metadata.range):fallback;
  const config=metadata.scoring?scoringSchema.parse(metadata.scoring):{method:"sum" as const,factor:fallback?.factor??1,bands:undefined,lookup:undefined};
  if(fallback&&(count!==fallback.count||range?.min!==fallback.min||range?.max!==fallback.max||config.method!=="sum"||(config.factor??fallback.factor??1)!==(fallback.factor??1)))throw new AppError(400,"A named standard instrument must keep its original item count, answer range and scoring. Use a custom key for a different questionnaire.");
  if(!count||count>100||!range||range.max<=range.min)throw new AppError(400,"This instrument needs a valid question count and answer range.");
  const bands=config.bands??[];
  if(bands.some(b=>b.max<b.min)||bands.some((b,i)=>bands.some((o,j)=>i!==j&&b.min<=o.max&&b.max>=o.min)))throw new AppError(400,"Interpretation bands must not overlap.");
  return {fallback,questions,count,range,config};
}
export function scoreInstrument(key:string,metadata:Record<string,unknown>,raw:unknown) {
  const {fallback,questions,count,range,config}=instrumentDefinition(key,metadata);
  if(!Array.isArray(raw)||raw.length!==count||raw.some(v=>typeof v!=="number"||!Number.isInteger(v)||v<range.min||v>range.max))throw new AppError(400,"Answers do not match the configured question count and allowed range.");
  const answers=raw as number[],sum=answers.reduce((n,v)=>n+v,0);
  let score=sum;
  if(config.method==="mean")score=sum/count;
  if(config.method==="percentage")score=(sum-count*range.min)/(count*(range.max-range.min))*100;
  if(config.method==="lookup") {
    const table=config.lookup??[];
    if(!table.length||new Set(table.map(r=>r.raw)).size!==table.length)throw new AppError(409,"A unique, approved raw-to-score conversion table is required.");
    const conversion=table.find(r=>r.raw===sum);
    if(!conversion)throw new AppError(409,"The approved conversion table does not cover this raw score; no score has been invented.");
    score=conversion.score;
  }
  score=Math.round(score*(config.factor??fallback?.factor??1)*100)/100;
  const bands=config.bands??[];
  let band=bands.find(b=>score>=b.min&&score<=b.max)?.label??"unclassified";
  if(!bands.length&&key==="phq9")band=score>=20?"severe":score>=15?"moderately severe":score>=10?"moderate":score>=5?"mild":"minimal";
  if(!bands.length&&key==="gad7")band=score>=15?"severe":score>=10?"moderate":score>=5?"mild":"minimal";
  return {answers,score,rawScore:sum,band,method:config.method,scoringSnapshot:{range:{min:range.min,max:range.max},...config,factor:config.factor??fallback?.factor??1},nonValidatedDemo:metadata.nonValidatedDemo===true||!Array.isArray(questions)||!questions.length};
}
