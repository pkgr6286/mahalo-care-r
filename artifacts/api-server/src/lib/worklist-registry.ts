import {db} from "@workspace/db";
import {sql} from "drizzle-orm";
type Score={patient_id:string;instrument:string;value:number;date:string;position:number};
type Interaction={patient_id:string;category:string;date:string;metadata:Record<string,unknown>};
export async function registryDetails(ids:string[]) {
  if(!ids.length) return new Map<string,Record<string,unknown>>();
  const selectedIds=sql.join(ids.map(id=>sql`${id}`),sql`,`);
  const scores=await db.execute<Score>(sql`SELECT patient_id,instrument,value,date,position FROM (
    SELECT patient_id,metadata->>'instrument' AS instrument,value,date,ROW_NUMBER() OVER(PARTITION BY patient_id,metadata->>'instrument' ORDER BY care_safe_timestamp(date) DESC,id DESC) AS position
    FROM care_records WHERE patient_id IN (${selectedIds}) AND kind='responses' AND metadata->>'instrument' IN ('phq9','gad7') AND care_safe_timestamp(date)<=now()
  ) ranked WHERE position<=2 ORDER BY patient_id,instrument,position`);
  const interactions=await db.execute<Interaction>(sql`SELECT DISTINCT ON (patient_id,category) patient_id,category,date,metadata FROM (
    SELECT patient_id,date,metadata,id,CASE WHEN metadata->>'kind'='consultant_review' THEN 'review' ELSE 'contact' END AS category
    FROM care_records WHERE patient_id IN (${selectedIds}) AND kind='interactions' AND status='completed' AND care_safe_timestamp(date)<=now()
    AND (metadata->>'kind'='consultant_review' OR (metadata->>'isLiveTwoWay'='true' AND metadata->>'driver' IS DISTINCT FROM 'stub' AND metadata->>'kind' IN ('phone','video','in_person')))
  ) visits ORDER BY patient_id,category,care_safe_timestamp(date) DESC,id DESC`);
  return new Map(ids.map(id=>{
    const phq=scores.rows.filter(s=>s.patient_id===id&&s.instrument==="phq9"),gad=scores.rows.find(s=>s.patient_id===id&&s.instrument==="gad7"),review=interactions.rows.find(r=>r.patient_id===id&&r.category==="review"),contact=interactions.rows.find(r=>r.patient_id===id&&r.category==="contact");
    const next=typeof review?.metadata.nextReviewAt==="string"?review.metadata.nextReviewAt:null;
    return [id,{latestPhq9:phq[0]?.value??null,latestGad7:gad?.value??null,scoreTrend:phq.length>1?phq[0]!.value-phq[1]!.value:null,lastContactAt:contact?.date??null,consultantReviewAt:review?.date??null,nextConsultantReviewAt:next,consultantReviewDue:!review||!next||Date.parse(next)<=Date.now()}];
  }));
}
