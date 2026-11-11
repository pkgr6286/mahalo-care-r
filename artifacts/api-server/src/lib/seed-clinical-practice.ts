import { and, desc,eq, inArray, sql } from "drizzle-orm";
import {
  db, patients, records, users, settings, datasetMemberships, programPolicies,
  patientConditions, patientMedications, patientCoverage, patientContacts, patientIdentifiers, documents,
  type PatientRow, type RecordRow,
} from "@workspace/db";
import { clinicalDemoCases } from "./clinical-demo-cases";
import { demoReferences, narrativeFor, showcaseId } from "./clinical-demo-data";
import {syncClinicalStaffDirectory} from "./staff-directory";
import {clinicalAccount} from "./datasets";
import { config } from "./config";
import { captureDocuments } from "./document-store";
import { calculateBilling } from "./billing";
import { bundledPolicyId } from "./program-policies";
import { writeAudit, type Actor, type RecordInput } from "./store";
import { localDay } from "./periods";
import { logger } from "./logger";
import { z } from "zod";
import { instrumentContentHash } from "./content-review";
import { hashPassword } from "./passwords";
import {ensurePublicScreeners} from "./public-screeners";

const datasetKey="clinical-demonstration-v1";
async function ensureSyntheticPortalAccounts(s:import("./store").Store,patientIds:string[]) {
  for(const {accountId,index,email} of [
    {accountId:"demo-rtm-patient",index:6,email:"rtm.patient@example.test"},
    {accountId:"demo-bhi-patient",index:26,email:"bhi.patient@example.test"},
  ]) {
    if((await s.select({id:users.id}).from(users).where(eq(users.id,accountId))).length)continue;
    const [patient]=await s.select().from(patients).where(eq(patients.id,patientIds[index]!));
    if(!patient||patient.dataset!=="clinical")continue;
    await s.insert(users).values({id:accountId,name:`${patient.firstName} ${patient.lastName}`,email,role:"patient",credential:"patient",patientId:patient.id,locationScopes:[],passwordHash:await hashPassword("MahaloDemo2026!"),status:"active"}).onConflictDoNothing();
  }
}
async function ensureSyntheticCaregiver(s:import("./store").Store,patientId:string) {
  const [existing]=await s.select().from(users).where(eq(users.id,"demo-caregiver"));
  if(existing)return;
  const [family]=await s.select().from(patientContacts).where(eq(patientContacts.patientId,patientId)).limit(1);
  if(family?.email.endsWith("@example.test"))await s.insert(users).values({id:"demo-caregiver",name:family.name,email:family.email.toLowerCase(),role:"caregiver",credential:"caregiver",status:"active",passwordHash:await hashPassword("MahaloDemo2026!"),locationScopes:[]}).onConflictDoNothing();
}
const datasetState=z.object({
  version:z.number(),preparedAt:z.string(),patientIds:z.array(z.string()),referenceIds:z.array(z.string()),
  scenarioCount:z.number(),clinicalRecords:z.number(),retainedLegacyRecords:z.number(),
  documentsPending:z.boolean(),synthetic:z.boolean(),
});
const actor:Actor={id:"demo-admin",name:"Mahalo demonstration configuration",role:"admin",credential:"RN",email:"demo@mahalo.care"};
const locations=["Garden City","Smithtown","Massapequa","Huntington","Port Jefferson","Riverhead"];
const sumAnswers=(total:number,count:number,max:number)=>Array.from({length:count},(_,i)=>Math.min(max,Math.max(0,total-i*max)));

/** Refresh only exact, owned synthetic boilerplate. Never replace a person's subsequent message. */
async function refreshClinicalConversations(s:import("./store").Store,patientIds:string[]) {
  const oldMessages=["I managed a short walk yesterday. Can we discuss how to pace my home program?","I would like to talk about my sleep and getting back into a regular routine.","I have been following my usual plan. Can we review my recent readings and the next appointment?"];
  let changed=0;
  for(const [i,c]of clinicalDemoCases.entries()){
    const [r]=await s.select().from(records).where(and(eq(records.id,showcaseId(`${i}:patient-message`)),eq(records.patientId,patientIds[i]!),eq(records.kind,"messages")));
    if(!r||r.metadata.synthetic!==true||r.metadata.scenarioKey!==`patient-${i+1}`||(!oldMessages.includes(r.description??"")&&r.description!==c.incomingMessage))continue;
    if(r.description===c.incomingMessage&&r.metadata.conversationVersion===2)continue;
    await s.update(records).set({description:c.incomingMessage,metadata:{...r.metadata,senderRole:"patient",conversationVersion:2},updatedAt:new Date()}).where(eq(records.id,r.id));
    await writeAudit(s,actor,"refresh_synthetic_care_conversation",r.id,r.patientId,{scenarioKey:`patient-${i+1}`,synthetic:true});
    changed++;
  }
  return changed;
}

/** Explicit, idempotent synthetic-data preparation. It never deletes retained records or resets passwords. */
export async function seedClinicalPractice() {
  if(config.DATA_CLASS!=="synthetic") throw new Error("Clinical demonstration preparation is restricted to synthetic data");
  const clock=new Date();
  const result=await db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    const [done]=await s.select().from(settings).where(eq(settings.id,datasetKey));
    if(done) {
      const state=datasetState.parse(done.value),staff=await s.select().from(users).where(sql`${users.id} LIKE 'demo-%' AND ${clinicalAccount} AND NOT EXISTS(SELECT 1 FROM care_dataset_memberships d WHERE d.entity_type='user' AND d.entity_id=${users.id} AND d.dataset='validation_pending')`);
      await ensureSyntheticCaregiver(s,state.patientIds[0]!);
      const refs=demoReferences(clock,staff);
      await s.insert(records).values(refs.filter(r=>r.kind!=="staff")).onConflictDoNothing();
      for(const u of staff)await syncClinicalStaffDirectory(s,u,actor);
      for(const ref of refs.filter(r=>r.kind==="instruments")) {
        const [current]=await s.select().from(records).where(eq(records.id,ref.id));
        if(current?.metadata.nonValidatedDemo===true&&current.metadata.contentApprovedForUse===true&&instrumentContentHash(current)===instrumentContentHash(ref)&&current.metadata.contentReviewHash!==instrumentContentHash(current)) {
          await s.update(records).set({metadata:{...current.metadata,contentReviewHash:instrumentContentHash(current)},updatedAt:clock}).where(eq(records.id,current.id));
          await writeAudit(s,{id:"demo-admin",name:"Demonstration configuration",role:"admin",credential:"admin",email:"demo@example.test"},"strengthen_demonstration_content_fingerprint",current.id);
        }
      }
      await ensurePublicScreeners(s,state.patientIds,clock);
      await ensureSyntheticPortalAccounts(s,state.patientIds);
      await refreshClinicalConversations(s,state.patientIds);
      return {...state,alreadyPrepared:true};
    }
    const staff=await s.select().from(users).where(sql`${users.id} LIKE 'demo-%'`);
    if(!staff.some(u=>u.id==="demo-admin")||!staff.some(u=>u.id==="demo-provider")) throw new Error("Prepare the demonstration accounts before creating clinical scenarios");
    const oldPatients=await s.select().from(patients),oldRecords=await s.select().from(records),oldUsers=await s.select().from(users),oldPolicies=await s.select().from(programPolicies);
    const classification=[
      ...oldRecords.map(r=>({entityType:"record",entityId:r.id,dataset:"legacy",reason:"Retained prior demonstration/verification data; superseded in clinical presentation only"})),
      ...oldUsers.filter(u=>!u.id.startsWith("demo-")).map(u=>({entityType:"user",entityId:u.id,dataset:"validation",reason:"Retained account outside the named clinical demonstration team"})),
      ...oldPolicies.map(p=>({entityType:"policy",entityId:p.id,dataset:"legacy",reason:"Retained policy history outside the curated demonstration configuration"})),
    ];
    for(let start=0;start<classification.length;start+=200) await s.insert(datasetMemberships).values(classification.slice(start,start+200)).onConflictDoNothing();
    await s.update(patients).set({dataset:"legacy"});
    const refs=demoReferences(clock,staff);
    await s.insert(records).values(refs);
    for(const u of staff)await syncClinicalStaffDirectory(s,u,actor);
    const all:RecordRow[]=[],patientIds:string[]=[];
    const at=(days:number,hour=15)=>{
      const d=new Date(clock);d.setUTCDate(d.getUTCDate()+days);d.setUTCHours(hour,0,0,0);
      return new Date(Math.min(d.getTime(),clock.getTime()-3600000)).toISOString();
    };
    // Allocate actual, non-overlapping business-hour intervals, including retained legacy evidence.
    const reserved=oldRecords.filter(r=>r.kind==="time"&&r.status==="committed").map(r=>({patientId:r.patientId,userId:String(r.metadata.userId??""),start:Date.parse(String(r.metadata.startedAt)),end:Date.parse(String(r.metadata.endedAt))}));
    const slots=new Map<string,number>();
    const allocate=(patientId:string,userId:string,minutes:number)=>{
      let slot=slots.get(userId)??0;
      for(let attempt=0;attempt<400;attempt++,slot++) {
        const date=new Date(Date.UTC(clock.getUTCFullYear(),clock.getUTCMonth(),1+Math.floor(slot/10),13,slot%10*45));
        const start=date.getTime(),end=start+minutes*60000;
        if(end>clock.getTime()) throw new Error("Not enough elapsed business-hour capacity to prepare this month's fictional time evidence");
        if(reserved.some(r=>(r.patientId===patientId||r.userId===userId)&&r.start<end&&r.end>start)) continue;
        slots.set(userId,slot+1);reserved.push({patientId,userId,start,end});
        return {startedAt:new Date(start).toISOString(),endedAt:new Date(end).toISOString()};
      }
      throw new Error("Could not allocate non-overlapping demonstration time");
    };
    for(const [i,c] of clinicalDemoCases.entries()) {
      const mrn=`MC-${1001+i}`,existing=oldPatients.find(p=>p.mrn===mrn),patientId=existing?.id??showcaseId(`patient:${i}`);
      patientIds.push(patientId);
      const manager=c.family==="RTM"?"Mia Chen":c.family==="BHI"?"Avery Morgan":"Elena Garcia";
      const phone=`(516) 555-01${String(20+i).padStart(2,"0")}`;
      const payer=i%7===6?"Commercial":"Medicare";
      const values={mrn,firstName:c.firstName,lastName:c.lastName,dob:`${1945+i%15}-${String(i%12+1).padStart(2,"0")}-${String(i%25+1).padStart(2,"0")}`,sex:i%2?"Male":"Female",email:`${c.firstName.toLowerCase()}.${c.lastName.toLowerCase()}@example.test`,phone,location:locations[i%locations.length]!,timezone:"America/New_York",status:"active",dataset:"clinical",conditions:c.problems.map(p=>p.display),medications:c.medications.map(m=>`${m.name} ${m.dose} ${m.frequency}`),payer,careManager:manager,updatedAt:clock};
      if(existing) {
        await writeAudit(s,actor,"prepare_synthetic_patient_story",patientId,patientId,{previousDemographics:existing,synthetic:true});
        await s.update(patients).set(values).where(eq(patients.id,patientId));
      } else await s.insert(patients).values({id:patientId,...values});
      await s.insert(patientConditions).values(c.problems.map((p,j)=>({id:showcaseId(`condition:${i}:${j}`),patientId,...p,onsetDate:`${2020+i%3}-03-15`,chronic:true,clinicalStatus:"active",source:"Fictional reconciled problem list",recordedBy:"demo-provider"})));
      await s.insert(patientMedications).values(c.medications.map((m,j)=>({id:showcaseId(`medication:${i}:${j}`),patientId,...m,route:m.name.toLowerCase().includes("inhal")||m.name==="Tiotropium"?"inhaled":"oral",status:"active",startedOn:"2025-06-01",reconciledAt:new Date(at(-3)),reconciledBy:"Nora Patel, MD"})));
      await s.insert(patientCoverage).values({id:showcaseId(`coverage:${i}`),patientId,payer,plan:payer==="Medicare"?"Medicare Part B":"Employer-sponsored PPO",memberId:`SYN-${String(100100+i)}`,effectiveFrom:"2026-01-01",status:"active",verifiedAt:new Date(at(-3))});
      await s.insert(patientContacts).values({id:showcaseId(`contact:${i}`),patientId,name:`${i%2?"David":"Laura"} ${c.lastName}`,relationship:i%2?"Son":"Daughter",phone:`(516) 555-01${String(60+i).padStart(2,"0")}`,email:`family.${c.lastName.toLowerCase()}@example.test`,emergency:true,sharingAllowed:false,sharingScope:[]});
      await s.insert(patientIdentifiers).values({id:showcaseId(`identifier:${i}`),patientId,system:"urn:mahalo:practice:mrn",value:mrn,source:"Practice registration"});
      const row=(kind:string,key:string,input:RecordInput)=>{
        const record:RecordRow={id:showcaseId(`${i}:${key}`),kind,patientId,program:input.program??c.family,title:input.title,status:input.status??"active",severity:input.severity??"low",description:input.description??"",assignee:input.assignee??manager,date:input.date??at(-1),value:input.value??0,unit:input.unit??"",metadata:{...input.metadata,synthetic:true,scenarioKey:`patient-${i+1}`},createdBy:"demo-admin",createdAt:clock,updatedAt:clock};
        all.push(record);return record;
      };
      const programs=c.family==="RPM"?["RPM","CCM"]:[c.family];
      for(const program of programs) {
        const enrollmentId=showcaseId(`${i}:enrollment:${program}`),plan=narrativeFor(c,program);
        const cocm=program==="BHI"&&i>=27;
        row("enrollments",`enrollment:${program}`,{title:`${program} care program`,program,date:at(-55),metadata:{consent:true,rulepackId:bundledPolicyId(program),rulepackVersion:"2026.1-demo",billingProvider:"Nora Patel",billingProviderId:"demo-provider",supplyAnchor:at(-45),initiatingVisitAt:at(-60).slice(0,10),assessment:program==="BHI",assessedAt:at(-53),cocm,consultant:cocm?"Jordan Reed":undefined,consultantAssignedAt:cocm?at(-52):undefined,variant:"msk"}});
        row("consents",`consent:${program}`,{title:`${program} participation${["RPM","RTM"].includes(program)?" and monitoring-data sharing":""} consent`,program,status:"captured",date:at(-56),description:"The fictional patient reviewed participation, expected contacts, possible cost sharing, data sharing and the right to withdraw. This document is part of a synthetic demonstration, not actual consent.",metadata:{version:1,enrollmentId,method:"verbal",consentTypes:["program",...(["RPM","RTM"].includes(program)?["device_sharing"]:[])],textVersion:"1.0",capturedAt:at(-56),capturedBy:"Elena Garcia",capturedById:"demo-caremanager"}});
        row("careplans",`plan:${program}`,{title:`${c.firstName}'s ${program} care plan`,program,status:"active",date:at(-50),description:c.plan,metadata:{...plan,enrollmentId,reconciledAt:at(-50).slice(0,10),signedBy:"Nora Patel",signedById:"demo-provider",signedAt:at(-50),nextReviewAt:at(7)}});
        const ownerId=program==="RTM"?"demo-therapist":program==="BHI"?"demo-behavioral":"demo-caremanager";
        const credential=program==="RTM"?"PT":program==="BHI"?"LCSW":"RN";
        const amounts=program==="BHI"&&cocm?[20,20,25]:program==="PCM"?[18,17]:i%5===4?[6,6]:[12,14];
        for(const [entry,minutes] of amounts.entries()) {
          const interval=allocate(patientId,ownerId,minutes);
          row("time",`time:${program}:${entry}`,{title:entry===0?"Review monitoring and reconcile the care plan":"Patient follow-up and care coordination",program,status:"committed",date:interval.startedAt,value:minutes,unit:"min",metadata:{...interval,userId:ownerId,credential,activity:entry===0?"review_data":"care_coordination",source:"manual",attested:true,description:entry===0?`Reviewed ${c.measure} history and the agreed goals.`:c.next},assignee:manager});
        }
        row("interactions",`contact:${program}`,{title:"Scheduled care-team telephone follow-up",program,status:"completed",date:at(-2),description:c.recent,metadata:{kind:"phone",isLiveTwoWay:true,driver:"staff_documented",occurredAt:at(-2),durationMinutes:12,participant:`${c.firstName} ${c.lastName}`,documentedById:ownerId}});
        row("notes",`note:${program}`,{title:`${program} follow-up · ${c.firstName} ${c.lastName}`,program,status:"signed",date:at(-2),description:`Patient priorities\n${c.goal}\n\nReview and discussion\n${c.recent}\n\nBarriers\n${c.barrier}\n\nAgreed next steps\n${c.next}\n\nFictional clinical scenario. No actual treatment or external communication occurred.`,metadata:{version:1,signedBy:"Nora Patel",signedById:"demo-provider",signedAt:at(-2),sections:{assessment:c.recent,plan:c.next,barriers:c.barrier}}});
      }
      if(["RPM","RTM"].includes(c.family)) row("devices","device",{title:c.family==="RTM"?"Home therapy tracking app":c.measure==="weight"?"Connected home weight scale":c.measure==="glucose"?"Connected blood glucose meter":"Connected upper-arm blood pressure monitor",status:i===5?"offline":"assigned",date:at(-54),description:"Assigned to the fictional patient; readings are generated within the demonstration.",metadata:{serial:`MC-HOME-${String(4100+i)}`,vendor:"Demonstration monitoring service",connectivity:c.family==="RTM"?"app":"cellular",setupCompleted:true,setupCompletedAt:at(-54),fdaCleared:c.family==="RPM",deviceCleared:c.family==="RPM",clearanceBasis:"Fictional scenario assumption only; not verification of an actual product",battery:i===5?12:72+i,lastSeenAt:at(i===5?-4:-1),enrollmentId:showcaseId(`${i}:enrollment:${c.family}`)}});
      for(let d=-43;d<=0;d++) {
        if(i===5&&d>-4||i===7&&d>-5||((i+d+100)%13===0)) continue;
        const trend=43+d,deviceId=showcaseId(`${i}:device`);
        if(c.family==="RPM") {
          const metadata={source:"device",valid:true,simulated:true,deviceId,deviceCleared:true};
          if(c.measure==="weight") row("observations",`reading:${d}`,{title:"Weight",status:"valid",date:at(d),value:Number((78.4+(d>=-3?(d+4)*.7:(i+d+100)%5*.1)).toFixed(1)),unit:"kg",metadata:{...metadata,loinc:"29463-7"}});
          else if(c.measure==="glucose") row("observations",`reading:${d}`,{title:"Blood glucose",status:"valid",date:at(d),value:172-Math.floor(trend*.7)+(i+d+100)%13,unit:"mg/dL",metadata:{...metadata,loinc:"2339-0"}});
          else {
            const systolic=i===0&&d===0?184:Math.round(148-trend*.25+(i+d+100)%9);
            const diastolic=i===0&&d===0?102:78+(i+d+100)%9;
            row("observations",`reading:${d}:systolic`,{title:"Systolic blood pressure",status:"valid",date:at(d),value:systolic,unit:"mmHg",metadata:{...metadata,loinc:"8480-6",diastolic}});
            row("observations",`reading:${d}:diastolic`,{title:"Diastolic blood pressure",status:"valid",date:at(d),value:diastolic,unit:"mmHg",metadata:{...metadata,loinc:"8462-4"}});
          }
        } else if(c.family==="RTM") row("observations",`reading:${d}`,{title:"Pain intensity",status:"valid",date:at(d),value:i===6&&d===0?8:Math.max(2,7-Math.floor(trend/12)+(i+d+100)%2),unit:"/10",metadata:{source:"patient_reported",loinc:"72514-3",valid:true,therapeuticStream:"pain"}});
      }
      if(c.family==="BHI"||c.family==="RTM") for(const [week,d] of [-28,-21,-14,-7,0].entries()) {
        const instrument=c.family==="BHI"?"phq9":"odi";
        const total=c.family==="BHI"?(i===26?17+week:Math.max(6,18-week*2+i%3)):Math.max(20,48-week*4+i%3*2);
        const answers=sumAnswers(instrument==="odi"?Math.round(total/2):total,instrument==="odi"?10:9,instrument==="odi"?5:3);
        row("responses",`response:${week}`,{title:instrument==="phq9"?"PHQ-9 symptom score":"Oswestry function score",status:"submitted",date:at(d,16),value:total,unit:instrument==="odi"?"%":"score",metadata:{instrument,answers,scoreBand:total>=20?"high":total>=10?"moderate":"low",source:"patient_reported",valid:true,administeredBy:"Fictional case history",syntheticScore:true}});
      }
      for(let d=-6;d<=0;d++) for(const [j,task] of [{title:c.family==="RTM"?"Record your prescribed home-program participation":"Record your daily care-plan check-in",taskKind:c.family==="RTM"?"exercise":"checkin"},{title:"Follow your prescribed medication routine",taskKind:"medication"}].entries()) {
        const completed=d<0&&!(i===7&&d>-5);
        row("tasks",`patient-task:${d}:${j}`,{title:task.title,status:completed?"completed":d<0?"missed":"pending",date:at(d,14),description:"Follow the individual plan agreed with your treating clinician.",metadata:{taskKind:task.taskKind,audience:"patient",dueAt:at(d,20),completedAt:completed?at(d,19):undefined,adherenceKind:task.taskKind==="medication"?"med":"exercise",source:"patient_reported"}});
      }
      row("tasks","staff-followup",{title:c.next,status:"pending",description:c.barrier,date:at(0),metadata:{audience:"staff",taskKind:"followup",dueAt:at(0),ownerUserId:c.family==="RTM"?"demo-therapist":c.family==="BHI"?"demo-behavioral":"demo-caremanager",ownerRole:c.family==="RTM"?"therapist":c.family==="BHI"?"behavioral_care_manager":"care_manager"}});
      row("messages","patient-message",{title:"Care-team conversation",status:"sent",date:at(-1,17),description:c.incomingMessage,metadata:{direction:"inbound",sender:`${c.firstName} ${c.lastName}`,channel:"secure",unread:i<4}});
      row("messages","team-message",{title:"Care-team conversation",status:"sent",date:at(-1,18),description:`Thank you for the update, ${c.firstName}. ${c.next} Please continue the individual plan already agreed with your clinician; this inbox is not an emergency service.`,metadata:{direction:"outbound",sender:manager,channel:"secure",unread:false}});
      if([0,1,5,6,7,14,20,26].includes(i)) {
        const title=i===0?"Blood pressure 184/102 mmHg — clinician review needed":i===1?"Weight increased over three days":i===5?"Home monitor has not transmitted for four days":i===6?"Pain increased after activity":i===7?"Home-program participation interrupted":i===26?"PHQ-9 increased to 21":i===20?"Specialist follow-up needs confirmation":"Medication pickup and transport need coordination";
        row("exceptions","priority",{title,status:"open",severity:i===0?"critical":[1,6,26].includes(i)?"high":"medium",date:at(0),description:i===0?"The latest fictional reading is above the configured systolic threshold. Confirm symptoms, repeat measurement and follow the practice's clinician escalation pathway.":c.next,metadata:{ownerUserId:i===0?"demo-admin":c.family==="RTM"?"demo-therapist":c.family==="BHI"?"demo-behavioral":"demo-caremanager",ownerRole:c.family==="RTM"?"therapist":c.family==="BHI"?"behavioral_care_manager":"care_manager",signalCount:1,sourceRecordId:showcaseId(`${i}:${i===0?"reading:0:systolic":i===26?"response:4":"staff-followup"}`),ruleId:showcaseId(`rule:${i===0?0:i===5?2:i===7?3:i===26?4:1}`),firstTriggeredAt:at(0),lastTriggeredAt:at(0)}});
      }
      if(c.family==="BHI"&&i>=27) row("interactions","consultant-review",{title:"Psychiatric consultant case review",status:"completed",date:at(-4),description:"The fictional consultant reviewed symptom trends, the current treatment plan and the follow-up pathway with the behavioral care manager. No autonomous medication change was made.",metadata:{kind:"consultant_review",reviewedAt:at(-4),reviewedById:"demo-consultant",reviewedBy:"Jordan Reed",credential:"psych_consultant",recommendation:"Continue coordinated follow-up and discuss persistent symptoms with the treating clinician."}});
    }
    for(let start=0;start<all.length;start+=150) await s.insert(records).values(all.slice(start,start+150));
    const patientAccount=staff.find(u=>u.id==="demo-patient");
    if(patientAccount) await s.update(users).set({patientId:patientIds[0],name:"Margaret Wilson"}).where(eq(users.id,patientAccount.id));
    const value={version:1,preparedAt:clock.toISOString(),patientIds,referenceIds:refs.map(r=>r.id),scenarioCount:patientIds.length,clinicalRecords:all.length,retainedLegacyRecords:oldRecords.length,documentsPending:true,synthetic:true};
    await ensureSyntheticCaregiver(s,patientIds[0]!);
    await ensurePublicScreeners(s,patientIds,clock);
    await ensureSyntheticPortalAccounts(s,patientIds);
    await s.insert(settings).values({id:datasetKey,value});
    await writeAudit(s,actor,"prepare_clinical_demonstration","practice",null,{scenarioCount:patientIds.length,records:all.length,retainedLegacyRecords:oldRecords.length,synthetic:true});
    logger.info({scenarioCount:patientIds.length,records:all.length},"Prepared coherent synthetic clinical scenarios");
    return value;
  });
  return result;
}

/** Private PDF retention is separate from data preparation, restartable and event-key idempotent. */
export async function retainClinicalDemoDocuments() {
  const [dataset]=await db.select().from(settings).where(eq(settings.id,datasetKey));
  if(!dataset) throw new Error("Prepare the clinical scenarios first");
  const ids=datasetState.parse(dataset.value).patientIds;
  for(const patientId of ids) {
    await db.transaction(async s=>{
      const candidates=await s.select().from(records).where(and(eq(records.patientId,patientId),sql`${records.metadata}->>'scenarioKey' IS NOT NULL`,inArray(records.kind,["careplans","notes","consents"])));
      if(candidates.length) await captureDocuments(s,actor,candidates.map(record=>({record,origin:"synthetic_scenario",eventKey:"clinical-demonstration-v1"})));
    });
  }
  await retainReadableClinicalDemoDocuments();
  await db.update(settings).set({value:{...dataset.value,documentsPending:false}}).where(eq(settings.id,datasetKey));
  return {patients:ids.length,documentsRetained:true};
}

/** Presentation copies reuse frozen clinical sources; consent proof objects are deliberately unchanged. */
export async function retainReadableClinicalDemoDocuments(){
  if(config.DATA_CLASS!=="synthetic")throw new Error("Synthetic document preparation is disabled for real patient data.");
  const [dataset]=await db.select().from(settings).where(eq(settings.id,datasetKey));
  if(!dataset)throw new Error("Prepare the clinical scenarios first.");
  let available=0;
  for(const patientId of datasetState.parse(dataset.value).patientIds){
    await db.transaction(async s=>{
      const rows=await s.select().from(records).where(and(eq(records.patientId,patientId),inArray(records.kind,["careplans","notes"]),sql`(${records.status}='signed' OR (${records.kind}='careplans' AND ${records.status}='active'))`,sql`${records.metadata}->>'scenarioKey' IS NOT NULL`));
      const entries=[];
      for(const record of rows){
        const [original]=await s.select().from(documents).where(and(eq(documents.recordId,record.id),sql`${documents.origin}<>'readable_presentation'`)).orderBy(desc(documents.version)).limit(1);
        if(!original)throw new Error("A clinical scenario is missing its retained source.");
        entries.push({record,sourceDocument:original,origin:"readable_presentation",eventKey:`readable-presentation-v1:${original.id}`});
      }
      if(entries.length)available+=(await captureDocuments(s,actor,entries)).length;
    });
  }
  return {presentationDocumentsAvailable:available,originalSourcesPreserved:true,consentEvidenceUnchanged:true};
}

export async function calculateClinicalDemoBilling() {
  return db.transaction(async s=>{
    await s.execute(sql`select pg_advisory_xact_lock(7348202)`);
    return calculateBilling(s,actor);
  });
}
