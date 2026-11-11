import { createHash } from "node:crypto";
import type { RecordRow } from "@workspace/db";
import { parseClinicalRule } from "./clinical-rule-schema";
import { bundledPolicyId } from "./program-policies";
import type { ClinicalDemoCase } from "./clinical-demo-cases";
import { instrumentContentHash } from "./content-review";

export const showcaseId=(key:string)=> {
  const h=createHash("sha256").update(`mahalo-clinical-showcase:${key}`).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
};
export function demoReferences(at:Date,staff:{id:string;name:string;role:string;credential:string;email:string}[]) {
  const output:RecordRow[]=[];
  const row=(kind:string,key:string,title:string,description:string,metadata:Record<string,unknown>,program:string|null=null)=>{
    output.push({id:showcaseId(key),kind,patientId:null,program,title,description,status:"active",severity:"low",assignee:"Sarah Mitchell",date:at.toISOString(),value:0,unit:"",metadata,createdBy:"demo-admin",createdAt:at,updatedAt:at});
  };
  const descriptions:Record<string,string>={
    RPM:"Home blood pressure, weight and glucose monitoring with coordinated care-team follow-up.",
    RTM:"Pain, function and participation in the patient's prescribed home therapy program.",
    CCM:"Monthly coordination for patients living with multiple chronic conditions.",
    PCM:"Focused coordination of a complex condition and its specialist care plan.",
    BHI:"Measurement-based behavioral care with a defined follow-up and consultation pathway.",
  };
  for(const [i,program] of ["RPM","RTM","CCM","PCM","BHI"].entries()) row("programs",`program:${program}`,({RPM:"Remote Physiologic Monitoring",RTM:"Remote Therapeutic Monitoring",CCM:"Chronic Care Management",PCM:"Principal Care Management",BHI:"Behavioral Health Integration"} as Record<string,string>)[program]!,descriptions[program]!,{key:program,area:["Cardiovascular","Musculoskeletal","Chronic conditions","Complex condition","Behavioral health"][i],color:["#3D36E8","#0D9488","#4077B5","#8765B5","#B87539"][i],version:"2026.1-demo",rulepackId:bundledPolicyId(program),threshold:program==="PCM"?30:20,verified:false},program);
  for(const [i,name] of ["Garden City","Smithtown","Massapequa","Huntington","Port Jefferson","Riverhead"].entries()) row("locations",`location:${i}`,name,"Outpatient care and remote care coordination",{timezone:"America/New_York",address:`${100+i*10} Care Way, Suite ${200+i}`,state:"NY",postalCode:["11530","11787","11758","11743","11777","11901"][i],placeOfService:"11",phone:`(516) 555-01${String(i+10).padStart(2,"0")}`,groupNpi:"",synthetic:true});
  for(const person of staff.filter(s=>!["patient","caregiver","billing","front_desk","read_only"].includes(s.role))) row("staff",`staff:${person.id}`,person.name,({admin:"Practice care lead",billing_provider:"Supervising physician",care_manager:"Registered nurse · care coordination",therapist:"Physical therapist",behavioral_care_manager:"Behavioral care manager",psychiatric_consultant:"Psychiatric consultant",clinical_admin:"Clinical operations lead"} as Record<string,string>)[person.role]??person.role.replaceAll("_"," "),{userId:person.id,email:person.email,role:person.role,credential:person.credential,locationScopes:[],synthetic:true});
  for(const [key,title,description] of [["Cardiovascular","Blood pressure and heart health","Home monitoring, medication reconciliation and a clear escalation contact."],["Diabetes","Living with diabetes","Glucose review, medication routines and coordinated follow-up."],["Musculoskeletal","Pain and functional recovery","Meaningful activity goals, prescribed therapy and patient-reported function."],["Behavioral health","Mood and everyday wellbeing","Patient priorities, symptom measures and coordinated behavioral follow-up."]]) row("templates",`template:${key}`,title!,description!,{version:1,area:key,reviewDays:30,goals:"Agree a measurable goal with the patient and review progress at the next planned contact.",sourceRef:"Original fictional demonstration scenario; clinical approval required before real use."});
  const rules=[
    ["Critical blood pressure","RPM","critical",{kind:"threshold",legacy_key:"bp_critical",any_of:[{loinc:"8480-6",op:"gte",value:180},{loinc:"8462-4",op:"gte",value:120}],within_hours:24,owner_role:"care_manager"}],
    ["High seven-day systolic mean","RPM","high",{kind:"trend",loinc:"8480-6",stat:"mean",op:"gte",value:150,window_days:7,min_points:4,owner_role:"care_manager"}],
    ["No monitoring data for three days","RPM","medium",{kind:"missing_data",stream:"device",days_without:3,only_if_enrolled_days_gte:3,owner_role:"care_manager"}],
    ["Exercise completion below 50 percent","RTM","medium",{kind:"adherence",item_kind:"exercise",window_days:7,completion_rate_lt:0.5,owner_role:"therapist"}],
    ["Severe PHQ-9 score","BHI","high",{kind:"score",instrument_key:"phq9",op:"gte",value:20,window_days:28,owner_role:"behavioral_care_manager"}],
    ["CCM management time at risk","CCM","low",{kind:"time_budget",program_key:"CCM",code:"99490",days_left_lte:7,minutes_short_gte:1,owner_role:"care_manager"}],
    ["RPM supply days at risk","RPM","low",{kind:"device_days_at_risk",program_key:"RPM",code:"99454",days_left_lte:6,shortfall_gte:1,owner_role:"care_manager"}],
    ["Positive PHQ-9 item 9","BHI","critical",{kind:"score",instrument_key:"phq9",item_flag:{index:9,op:"gt",value:0},window_days:28,owner_role:"behavioral_care_manager"}],
  ] as const;
  for(const [i,[title,program,severity,body]] of rules.entries()) {
    row("rules",`rule:${i}`,title,"Practice demonstration threshold. Clinician approval is required before real patient use.",parseClinicalRule({...body,version:"1.0",provisional:true,sourceRef:"Supplied build specification; original synthetic practice configuration.",notify:{channels:["in_app"],quiet_period_minutes:60}}),program);
    output[output.length-1]!.severity=severity;
  }
  for(const [name,driver,description] of [
    ["Home monitoring service","simulator","Device readings in this practice are synthetic. A vendor connection can be configured later."],
    ["Electronic health record","fixture","Read-only FHIR demonstration. No external EHR is connected."],
    ["Patient email","console","Delivery is captured locally; no emails are sent."],
    ["Patient text messages","console","Delivery is captured locally; no text messages are sent."],
    ["Video appointments","stub","Local appointment workflow; a video provider is not connected."],
    ["Clinical drafting assistant","deterministic","Human-reviewed chart drafting. Live synthetic AI is available only when explicitly requested."],
  ]) {row("integrations",`integration:${name}`,name!,description!,{driver,lastSync:null});output[output.length-1]!.status="simulated";}
  for(const [key,title,body] of [
    ["readings","Your home monitoring routine","Use the device and measurement schedule already agreed with your care team. This portal lets you review the readings received and send a secure message if equipment is not working. Do not change a prescription from anything shown in this demonstration."],
    ["care-team","Getting the most from a care-team conversation","Before your next scheduled contact, make a note of the questions you want to ask, any difficulty following the existing plan, and any prescriptions you need to review. Secure messages are not an emergency service."],
    ["therapy","Recording progress with your home program","Your therapist sets your individual program. Use your check-in to describe comfort, function and barriers honestly. A recorded completion is your report of participation, not a change to the prescribed therapy."],
  ]) row("education",`education:${key}`,title!,"A short guide to using your care program.",{body,type:"education",contentVersion:"1",nonClinical:true,sourceRef:"Original Mahalo demonstration portal guide",licenseNote:"Original demonstration content; no third-party clinical material reproduced."});
  const instruments=[
    ["pain_nrs","Daily pain check-in",["How would you rate your pain today on a scale from 0 to 10?"]],
    ["phq9","Mood check-in · PHQ-9 demonstration",["Interest in usual activities","Feeling low or discouraged","Sleep difficulties","Energy during the day","Changes in appetite","Feelings about yourself","Difficulty concentrating","Changes in movement or restlessness","Thoughts about personal safety"]],
    ["gad7","Anxiety check-in · GAD-7 demonstration",["Feeling nervous","Difficulty setting worries aside","Worries about several things","Difficulty relaxing","Restlessness","Feeling irritable","Feeling afraid about what might happen"]],
    ["odi","Daily function · ODI demonstration",["Comfort during usual activities","Personal care","Lifting everyday objects","Walking","Sitting","Standing","Sleep","Social activities","Travel","Changes to your daily routine"]],
    ["pgic","Overall progress check-in",["Compared with the start of your care program, how has your everyday function changed?"]],
  ] as const;
  for(const [key,title,questions] of instruments) {
    row("instruments",`instrument:${key}`,title,"Original demonstration prompts. These are not the validated instrument wording and are not approved for real clinical assessment.",{key,questions:[...questions],contentVersion:"demo-1",nonValidatedDemo:true,sourceRef:"Original synthetic demonstration prompts; replace with clinically approved instrument wording before live use.",licenseNote:"Original demonstration wording only. No claim of validated or licensed clinical instrument content.",contentApprovedForUse:true,contentReviewedById:"demo-admin",contentReviewedBy:"Demonstration configuration",contentReviewedAt:at.toISOString()},key==="phq9"||key==="gad7"?"BHI":key==="odi"||key==="pgic"?"RTM":null);
    const r=output[output.length-1]!;
    r.metadata.contentReviewHash=instrumentContentHash(r);
  }
  return output;
}

export function narrativeFor(c:ClinicalDemoCase,program:string) {
  return {
    schemaVersion:2,version:1,problems:c.problems.map(p=>p.display),medications:c.medications.map(m=>`${m.name} ${m.dose} ${m.frequency}`),
    goals:c.goal,interventions:c.plan,expectedOutcome:"Support the patient's stated goal with regular review of symptoms, participation and practical barriers; response will be reassessed with the treating clinician.",
    careTeam:program==="RTM"?"Mia Chen, PT; Nora Patel, MD":program==="BHI"?"Avery Morgan, LCSW; Jordan Reed, psychiatric consultant; Nora Patel, MD":"Elena Garcia, RN; Nora Patel, MD",
    reviewDays:30,complexity:"standard",barriers:c.barrier,qualifyingCondition:c.problems[0]!.display,qualifyingConditionMonths:24,expectedDurationMonths:12,
    monitoredParameters:c.measure,readingSchedule:"Follow the established daily home-monitoring schedule.",escalationContact:"Contact the care team using the agreed symptom and monitoring plan.",
    diagnosis:c.problems[0]!.display,therapyReference:"Individual home program prescribed by the treating physical therapist",exercises:"Follow the therapist's current home program; document participation and any barriers.",
    initialAssessment:"The patient discussed mood, sleep, daily activity, treatment preferences and the agreed follow-up pathway.",scaleKey:"phq9",referralPath:"Treating clinician and psychiatric consultant through the practice's agreed referral pathway.",
    items:[
      {id:"daily-checkin",title:program==="RTM"?"Record pain and daily function":program==="BHI"?"Complete the scheduled wellbeing check-in":"Review today's care-plan checklist",kind:"checkin",rrule:"FREQ=DAILY",hour:10,windowMinutes:600},
      {id:"medication-routine",title:"Follow the prescribed medication routine",kind:"medication",rrule:"FREQ=DAILY",hour:9,windowMinutes:600},
      ...(program==="RTM"?[{id:"home-program",title:"Record participation in the prescribed home program",kind:"exercise",rrule:"FREQ=WEEKLY;BYDAY=MO,WE,FR",hour:11,windowMinutes:600}]:[]),
    ],
  };
}
