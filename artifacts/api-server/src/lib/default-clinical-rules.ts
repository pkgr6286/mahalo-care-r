import {records} from "@workspace/db";
import {allRecords,patchRecord,writeAudit,now,type Actor} from "./store";
import {db} from "@workspace/db";
import {sql} from "drizzle-orm";
import {parseClinicalRule} from "./clinical-rule-schema";
const actor:Actor={id:"system",name:"Local clinical configuration",role:"admin",credential:"admin",email:"local@example.test"};
const definitions=[
  {legacy:"threshold",program:"RPM",title:"Critical blood pressure",severity:"critical",body:{kind:"threshold",legacy_key:"bp_critical",any_of:[{loinc:"8480-6",op:"gte",value:180},{loinc:"8462-4",op:"gte",value:120}],within_hours:24,confirm_with_n_readings:1,owner_role:"care_manager",notify:{channels:["in_app"],quiet_period_minutes:30,on_call_role:"clinical_admin"}}},
  {legacy:"trend",program:"RPM",title:"High seven-day systolic mean",severity:"high",body:{kind:"trend",loinc:"8480-6",stat:"mean",op:"gte",value:150,window_days:7,min_points:4,owner_role:"care_manager"}},
  {legacy:"missing_data",program:"RPM",title:"No monitoring data for three days",severity:"medium",body:{kind:"missing_data",stream:"device",days_without:3,only_if_enrolled_days_gte:3,owner_role:"care_manager"}},
  {legacy:"adherence",program:"RTM",title:"Exercise completion below 50 percent",severity:"medium",body:{kind:"adherence",item_kind:"exercise",window_days:7,completion_rate_lt:0.5,owner_role:"therapist"}},
  {legacy:"score",program:"BHI",title:"Severe PHQ-9 score",severity:"high",body:{kind:"score",instrument_key:"phq9",op:"gte",value:20,window_days:28,owner_role:"behavioral_care_manager"}},
  {legacy:"time_budget",program:"CCM",title:"CCM management time at risk",severity:"low",body:{kind:"time_budget",program_key:"CCM",code:"99490",days_left_lte:7,minutes_short_gte:1,owner_role:"care_manager"}},
  {legacy:"device_days_at_risk",program:"RPM",title:"RPM supply days at risk",severity:"low",body:{kind:"device_days_at_risk",program_key:"RPM",code:"99454",days_left_lte:6,shortfall_gte:1,owner_role:"care_manager"}},
];
/** Upgrade only exact, untouched starter definitions. Never replace an edited practice rule. */
export async function ensureClinicalRuleDefaults() {
  await db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    const rs=await allRecords(s,"rules");
    for(const [i,d] of definitions.entries()) {
      const legacyTitle=d.legacy.replaceAll("_"," ").replace(/^./,c=>c.toUpperCase());
      const untouched=rs.find(r=>r.title===legacyTitle&&r.program===(i%2?"RTM":"RPM")&&r.status==="active"&&r.createdBy==="system"&&r.severity==="low"&&r.assignee==="Sarah Mitchell"&&r.description==="Configurable synthetic-demo rule; clinician approval required before live use."&&Object.keys(r.metadata).length===5&&r.metadata.kind===d.legacy&&r.metadata.threshold===(i===0?180:3)&&r.metadata.owner==="care_manager"&&r.metadata.version===1&&r.metadata.verified===false);
      if(untouched) await patchRecord(s,untouched,{title:d.title,program:d.program,severity:d.severity,description:"Provisional supplied-specification starting value. Clinician approval is required before real use.",metadata:parseClinicalRule({...d.body,version:"2-demo",sourceRef:"Supplied build specification, clinical rules pp.39–40",provisional:true,reviewRequired:true})},actor,"upgrade_untouched_demo_rule");
    }
    if(!rs.some(r=>r.id==="default-phq9-item9")) {
      await s.insert(records).values({id:"default-phq9-item9",kind:"rules",title:"Positive PHQ-9 item 9",program:"BHI",status:"active",severity:"critical",assignee:"",description:"Provisional safety follow-up flag, not a diagnosis. Follow the practice's reviewed urgent-help procedure.",createdBy:"system",date:now(),metadata:parseClinicalRule({kind:"score",version:"2-demo",instrument_key:"phq9",window_days:28,item_flag:{index:9,op:"gt",value:0},owner_role:"behavioral_care_manager",notify:{channels:["in_app"],quiet_period_minutes:30,on_call_role:"clinical_admin"},provisional:true,reviewRequired:true,sourceRef:"Supplied build specification, BHI defaults p.40"})});
      await writeAudit(s,actor,"create_provisional_clinical_rule","default-phq9-item9");
    }
  });
}
