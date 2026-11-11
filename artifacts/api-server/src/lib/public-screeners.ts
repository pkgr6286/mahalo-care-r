import {and,eq,inArray} from "drizzle-orm";
import {records,settings,datasetMemberships,type RecordRow} from "@workspace/db";
import {type Store,writeAudit} from "./store";
import {showcaseId} from "./clinical-demo-data";
import {clinicalRecord} from "./datasets";
import {instrumentContentHash} from "./content-review";
import {scoreInstrument} from "./instrument-scoring";

const sourceRef="https://uhs.fsu.edu/sites/g/files/upcbnu1651/files/docs/COVID/PHQ-9%20and%20GAD-7%20Form%20Fillable.pdf";
const permissionRef="https://www.pfizer.com/news/press-release/press-release-detail/pfizer_to_offer_free_public_access_to_mental_health_assessment_tools_to_improve_diagnosis_and_patient_care";
export const publicScreenerQuestions={
  phq9:[
    "Little interest or pleasure in doing things.",
    "Feeling down, depressed, or hopeless.",
    "Trouble falling or staying asleep, or sleeping too much.",
    "Feeling tired or having little energy.",
    "Poor appetite or overeating.",
    "Feeling bad about yourself — or that you are a failure or have let yourself or your family down.",
    "Trouble concentrating on things, such as reading the newspaper or watching television.",
    "Moving or speaking so slowly that other people could have noticed. Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual.",
    "Thoughts that you would be better off dead, or of hurting yourself in some way.",
  ],
  gad7:[
    "Feeling nervous, anxious, or on edge.",
    "Not being able to stop or control worrying.",
    "Worrying too much about different things.",
    "Trouble relaxing.",
    "Being so restless that it's hard to sit still.",
    "Becoming easily annoyed or irritable.",
    "Feeling afraid as if something awful might happen.",
  ],
};
export function publicScreener(key:keyof typeof publicScreenerQuestions,clock:Date):RecordRow {
  const r:RecordRow={
    id:showcaseId(`public-screener:english:${key}:1`),kind:"instruments",patientId:null,program:"BHI",
    title:key==="phq9"?"PHQ-9 · Depression symptoms":"GAD-7 · Anxiety symptoms",
    description:"Published English questionnaire configured for synthetic case demonstrations. A score is not a diagnosis; clinical deployment requires independent approval and an escalation protocol.",
    status:"active",severity:"low",assignee:"Jordan Reed",date:clock.toISOString(),value:0,unit:"",createdBy:"demo-admin",createdAt:clock,updatedAt:clock,
    metadata:{
      key,questions:publicScreenerQuestions[key],contentVersion:"published-english-1",language:"en",
      instructions:"Over the last 2 weeks, how often have you been bothered by any of the following problems?",
      answerLabels:["Not at all","Several days","More than half the days","Nearly every day"],
      range:{min:0,max:3},scoring:{method:"sum",factor:1},nonValidatedDemo:false,
      sourceRef,permissionRef,sourceType:"published_source",attribution:"Developed by Robert L. Spitzer, Janet B. W. Williams, Kurt Kroenke and colleagues, with Pfizer support.",
      licenseNote:"Pfizer makes PHQ and GAD instruments available without copyright restriction and at no charge (July 21, 2010). Published English wording; clinical deployment still requires local qualified review.",
      contentApprovedForUse:true,contentReviewedById:"demo-admin",contentReviewedBy:"Synthetic-practice source transcription",
      contentReviewedAt:clock.toISOString(),approvalScope:"synthetic_demonstration_only",fingerprintVersion:3,
    },
  };
  r.metadata.contentReviewHash=instrumentContentHash(r);return r;
}
function answers(total:number,count:number) {
  if(!Number.isInteger(total)||total<0||total>count*3)throw new Error("Synthetic screener trajectory is outside its scoring range");
  return Array.from({length:count},()=>{const n=Math.min(3,total);total-=n;return n;});
}
/** Additive, synthetic-only curation: retained old responses are never rewritten. */
export async function ensurePublicScreeners(s:Store,patientIds:string[],clock:Date) {
  const marker="clinical-demonstration-public-screeners-v1";
  const actor={id:"demo-admin",name:"Synthetic-practice source transcription",email:"demo@example.test",role:"admin",credential:"admin"};
  const defs=[publicScreener("phq9",clock),publicScreener("gad7",clock)];
  for(const def of defs){
    const [current]=await s.select().from(records).where(eq(records.id,def.id));
    if(current?.metadata.contentApprovedForUse===true&&instrumentContentHash(current)===instrumentContentHash(def)&&current.metadata.contentReviewHash!==instrumentContentHash(current)){
      await s.update(records).set({metadata:{...current.metadata,contentReviewHash:instrumentContentHash(current),fingerprintVersion:3},updatedAt:clock}).where(eq(records.id,current.id));
      await writeAudit(s,actor,"stabilize_reviewed_demo_fingerprint",current.id,null,{algorithm:"canonical_nested_json_v3",scope:"unchanged_owned_source_content"});
    }
  }
  if((await s.select().from(settings).where(eq(settings.id,marker))).length)return;
  await s.insert(records).values(defs).onConflictDoNothing();
  const historical=await s.select().from(records).where(and(eq(records.kind,"responses"),inArray(records.patientId,patientIds),clinicalRecord));
  const prior=historical.filter(r=>r.metadata.instrument==="phq9"&&r.metadata.syntheticScore===true&&r.program==="BHI");
  const replacements:RecordRow[]=[];
  const [functionInstrument]=await s.select().from(records).where(eq(records.id,showcaseId("instrument:odi")));
  const priorFunction=historical.filter(r=>r.metadata.instrument==="odi"&&r.metadata.syntheticScore===true&&r.program==="RTM");
  if(functionInstrument)for(const old of priorFunction) {
    const result=scoreInstrument("odi",functionInstrument.metadata,old.metadata.answers);
    replacements.push({...old,id:showcaseId(`practice-function-response:${old.id}`),title:"Daily function review · practice wording",createdAt:clock,updatedAt:clock,
      metadata:{...old.metadata,...result,scoreBand:result.band,wording:"synthetic_practice_prompts",instrumentId:functionInstrument.id,instrumentVersion:functionInstrument.metadata.contentVersion,instrumentContentHash:instrumentContentHash(functionInstrument),
        instrumentSnapshot:{title:functionInstrument.title,...functionInstrument.metadata},priorPracticeResponseId:old.id}});
  }
  // Independent fictional GAD-7 trajectories, NOT a conversion from PHQ-9.
  const anxiety=[[11,10,9,7,6],[9,8,7,6,5],[7,8,9,10,12],[12,11,9,7,6],[10,9,8,6,5],[8,8,7,6,5]];
  for(const [patientIndex,patientId] of patientIds.entries()) {
    const visits=prior.filter(r=>r.patientId===patientId).sort((a,b)=>a.date.localeCompare(b.date));
    for(const [visitIndex,old] of visits.entries())for(const def of defs) {
      const key=def.metadata.key as "phq9"|"gad7";
      // These stories contain no ideation scenario: PHQ item 9 is explicitly zero.
      const raw=key==="phq9"?[...answers(old.value,8),0]:answers(anxiety[patientIndex%6]![Math.min(visitIndex,4)]!,7);
      const result=scoreInstrument(key,def.metadata,raw);
      replacements.push({...old,id:showcaseId(`public-response:${old.id}:${key}`),title:`${key==="phq9"?"PHQ-9":"GAD-7"} symptom review`,status:"completed",value:result.score,unit:"score",createdAt:clock,updatedAt:clock,
        metadata:{instrument:key,instrumentId:def.id,instrumentVersion:def.metadata.contentVersion,instrumentContentHash:instrumentContentHash(def),instrumentSnapshot:{title:def.title,...def.metadata},
          ...result,scoreBand:result.band,wording:"published_english",source:"patient_reported",syntheticScore:true,syntheticCaseHistory:true,
          priorPracticeResponseId:old.id,valid:true,administeredBy:"Fictional case history"}});
    }
  }
  if(replacements.length)await s.insert(records).values(replacements).onConflictDoNothing();
  const retired=[...prior.map(r=>r.id),...priorFunction.map(r=>r.id)];
  for(const key of ["phq9","gad7"]) {
    const [old]=await s.select().from(records).where(eq(records.id,showcaseId(`instrument:${key}`)));
    if(old?.metadata.nonValidatedDemo===true&&old.metadata.contentVersion==="demo-1") {
      await s.update(records).set({status:"retired",updatedAt:clock}).where(eq(records.id,old.id));retired.push(old.id);
    }
  }
  if(retired.length)await s.insert(datasetMemberships).values(retired.map(entityId=>({entityType:"record",entityId,dataset:"legacy",reason:"Prior synthetic practice wording retained as history; public-source screener case history is now available."}))).onConflictDoNothing();
  await s.insert(settings).values({id:marker,value:{preparedAt:clock.toISOString(),instrumentIds:defs.map(d=>d.id),newResponseIds:replacements.map(r=>r.id),retainedPriorIds:retired,synthetic:true}});
  await writeAudit(s,actor,"prepare_public_source_screener_cases",marker,null,{instruments:2,responses:replacements.length,retainedPriorRecords:retired.length,sourceRef,permissionRef});
}
