import { db, users, patients, records, settings } from "@workspace/db";
import { hashPassword } from "./passwords";
import { id, type RecordInput } from "./store";
import { logger } from "./logger";

export async function seedDemo() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length) return;
  const passwordHash = await hashPassword("MahaloDemo2026!");
  await db.transaction(async s => {
    // Advisory lock makes simultaneous first-starts safe.
    await s.execute((await import("drizzle-orm")).sql`select pg_advisory_xact_lock(7348201)`);
    if ((await s.select({id:users.id}).from(users).limit(1)).length) return;
    await s.insert(users).values({ id:"demo-admin", email:"demo@mahalo.care", name:"Sarah Mitchell", credential:"RN", role:"admin", passwordHash });
    await s.insert(settings).values({id:"practice",value:{name:"Groth Pain & Spine",supportEmail:"support@example.test",supportPhone:"(555) 010-0200",timezone:"America/New_York",accentColor:"#3D36E8",patientAppName:"Mahalo Care",notifications:true,quietHours:"20:00–08:00"}});
    const row = (kind: string, input: RecordInput) => ({
      id:id(),kind,title:input.title,patientId:input.patientId||null,program:input.program||null,
      status:input.status||"active",severity:input.severity||"low",description:input.description||"",
      assignee:input.assignee||"Sarah Mitchell",date:input.date||new Date().toISOString(),
      value:input.value||0,unit:input.unit||"",metadata:input.metadata||{},createdBy:"system",
    });
    const all: ReturnType<typeof row>[] = [];
    const programs = [
      ["RPM","Remote Physiologic Monitoring","Cardiovascular","#3D36E8"],
      ["RTM","Remote Therapeutic Monitoring","Musculoskeletal","#0D9488"],
      ["CCM","Chronic Care Management","Chronic conditions","#4077B5"],
      ["PCM","Principal Care Management","Complex condition","#8765B5"],
      ["BHI","Behavioral Health Integration","Behavioral health","#B87539"],
    ];
    programs.forEach(([key,name,area,color]) => all.push(row("programs",{title:name!,program:key,status:"active",description:`${area} · versioned 2026 demo rule pack; clinical and CMS verification required before live use.`,metadata:{key,area,color,version:"2026.demo",threshold:key==="PCM"?30:20,verified:false}})));
    ["Garden City","Smithtown","Massapequa","Huntington","Port Jefferson","Riverhead"].forEach((name,i) =>
      all.push(row("locations",{title:name,description:"New York · outpatient specialty care",metadata:{timezone:"America/New_York",npi:`DEMO-${1000+i}`,placeOfService:"11"}})));
    [["Sarah Mitchell","RN","Care manager"],["James Anderson","MD","Billing provider"],["Emily Chen","PT","Therapist"],["Michael Brooks","LCSW","Behavioral care manager"],["Olivia Patel","MD","Psychiatric consultant"]].forEach(([name,credential,role]) =>
      all.push(row("staff",{title:name!,description:role,metadata:{credential,email:`${name!.toLowerCase().replace(" ",".")}@example.test`,role}})));
    for (const [area,detail] of [["Cardiovascular","Blood pressure, heart rate and weight"],["Diabetes","Glucose monitoring and medication adherence"],["Musculoskeletal","Pain, function and prescribed exercise"],["Behavioral health","Symptom scales, care coordination and consultant review"]]) {
      all.push(row("templates",{title:area!,description:detail,metadata:{version:1,goals:"Improve function and support self-management",reviewDays:30}}));
    }
    for (const [key,name] of [["phq9","PHQ-9"],["gad7","GAD-7"],["pain_nrs","Pain NRS"],["odi","Oswestry Disability Index"],["pgic","Patient Global Impression of Change"]]) {
      all.push(row("instruments",{title:name!,description:"Synthetic demonstration scoring; instrument wording/license requires verification before clinical use.",metadata:{key,license:"verification_required"}}));
    }
    for (const [name,description] of [["Understanding your blood pressure","How to take a consistent reading"],["A gentle start to daily movement","A paced activity guide"],["Your medication routine","Building a schedule that works for you"]]) {
      all.push(row("education",{title:name!,description}));
    }
    for (const [name,driver] of [["Cellular device cloud","simulator"],["FHIR R4","fixture"],["OmniMD","fixture"],["SMS notifications","console"],["Email notifications","console"],["Video visits","stub"],["Mahalo Intelligence","deterministic"]]) {
      all.push(row("integrations",{title:name!,status:"simulated",description:"Synthetic demo adapter. No live account connected.",metadata:{driver,lastSync:null}}));
    }
    const names = [
      ["Margaret","Wilson"],["Robert","Thompson"],["Patricia","Garcia"],["James","Miller"],["Linda","Davis"],["William","Martinez"],
      ["Barbara","Anderson"],["Richard","Taylor"],["Susan","Thomas"],["Joseph","Moore"],["Jessica","Jackson"],["Charles","Martin"],
      ["Nancy","Lee"],["Thomas","Perez"],["Karen","White"],["Christopher","Harris"],["Lisa","Clark"],["Daniel","Lewis"],
      ["Betty","Robinson"],["Matthew","Walker"],["Sandra","Hall"],["Anthony","Young"],["Donna","Allen"],["Mark","King"],
      ["Carol","Wright"],["Steven","Scott"],["Ruth","Green"],["Paul","Adams"],["Sharon","Baker"],["Andrew","Nelson"],
    ];
    const locations = ["Garden City","Smithtown","Massapequa","Huntington","Port Jefferson","Riverhead"];
    const startOfMonth = new Date(); startOfMonth.setUTCDate(1);startOfMonth.setUTCHours(0,0,0,0);
    for (let i=0;i<names.length;i++) {
      const patientId=id(), [firstName,lastName]=names[i]!;
      const program=programs[i%5]![0]!;
      const condition=program==="RPM"?"Essential hypertension":program==="RTM"?"Chronic low back pain":program==="BHI"?"Depression":program==="PCM"?"Complex chronic pain":"Hypertension";
      await s.insert(patients).values({id:patientId,mrn:`MC-${String(1001+i)}`,firstName:firstName!,lastName:lastName!,dob:`${1948+i%25}-${String(i%12+1).padStart(2,"0")}-${String(i%25+1).padStart(2,"0")}`,sex:i%2?"Male":"Female",location:locations[i%6]!,email:`patient${i+1}@example.test`,phone:`555-010-${String(1000+i)}`,conditions:program==="CCM"?[condition,"Type 2 diabetes"]:[condition],medications:["Medication review documented — synthetic data"],payer:i%3?"Medicare":"Commercial",careManager:"Sarah Mitchell"});
      all.push(row("enrollments",{patientId,program,title:`${program} enrollment`,metadata:{consent:true,rulepackVersion:"2026.demo",billingProvider:"James Anderson"}}));
      if (i%5===0) all.push(row("enrollments",{patientId,program:"CCM",title:"CCM enrollment",metadata:{consent:true,rulepackVersion:"2026.demo",billingProvider:"James Anderson"}}));
      all.push(row("consents",{patientId,program,title:`${program} program and device-sharing consent`,status:"captured",description:"Synthetic consent captured for demonstration only.",metadata:{method:"electronic",textVersion:"1.0",capturedAt:startOfMonth.toISOString()}}));
      all.push(row("careplans",{patientId,program,title:`${firstName}'s ${program} care plan`,status:i%7===0?"draft":"active",description:`Support ${firstName} with ${condition.toLowerCase()}, monitor symptoms and review progress monthly.`,metadata:{version:1,goals:"Improve daily function and maintain stable readings.",interventions:"Daily monitoring, medication review, education and monthly care-team review.",reviewDays:30,signedBy:i%7===0?null:"James Anderson",signedAt:i%7===0?null:startOfMonth.toISOString(),complexity:"moderate_or_high"}}));
      const count= Math.min(new Date().getUTCDate(), 7+i%10);
      for(let d=0;d<count;d++) {
        const at=new Date(startOfMonth);at.setUTCDate(d+1);at.setUTCHours(14);
        all.push(row("observations",{patientId,program,title:program==="RPM"?"Blood pressure":program==="RTM"?"Pain check-in":"Daily wellness",date:at.toISOString(),value:program==="RPM"?120+(i*7+d*3)%40:program==="RTM"?3+(i+d)%5:65+(i+d)%20,unit:program==="RPM"?"mmHg":program==="RTM"?"/10":"score",metadata:{diastolic:program==="RPM"?75+(i+d)%15:undefined,source:program==="RPM"?"device":"patient_reported",valid:true,simulated:true,deviceCleared:program==="RPM"}}));
      }
      if (i<12) {
        const severity=i<2?"critical":i<6?"high":"medium";
        all.push(row("exceptions",{patientId,program,title:i<2?"Blood pressure above critical threshold":i<6?"Pain reported above baseline":"No check-in received in 3 days",status:"open",severity,description:i<2?"Systolic reading 182 mmHg requires clinician review.":i<6?"Pain increased by 3 points from the recorded baseline.":"Follow up on missed monitoring tasks.",value:i<2?182:i<6?8:3,unit:i<2?"mmHg":i<6?"/10":"days",metadata:{ruleKey:i<2?"bp_critical":i<6?"pain_high":"missing_data",signalCount:1}}));
      }
      for(const [title,kind] of [["Take your daily reading","reading"],["Complete your check-in","checkin"],["Take scheduled medication","medication"],["Practice gentle movement","exercise"]]) {
        all.push(row("tasks",{patientId,program,title:title!,status:i%4===0?"completed":"pending",description:kind==="exercise"?"Follow your prescribed plan. Stop and contact your care team if you have concerns.":"Part of your active care plan.",metadata:{taskKind:kind,dueAt:new Date().toISOString()}}));
      }
      // Unique clinician time intervals, shared across programs without overlap.
      const timeStart=new Date(startOfMonth.getTime()+(i+1)*70*60*1000);
      const minutes=12+(i%5)*9;
      const timeEnd=new Date(timeStart.getTime()+minutes*60000);
      all.push(row("time",{patientId,program,title:"Care coordination and data review",status:"committed",date:timeStart.toISOString(),value:minutes,unit:"min",metadata:{startedAt:timeStart.toISOString(),endedAt:timeEnd.toISOString(),activity:"review_data",source:"timer",userId:"demo-admin",credential:"RN"}}));
      all.push(row("interactions",{patientId,program,title:"Monthly care check-in",status:"completed",description:"Discussed monitoring and confirmed care-plan understanding.",metadata:{kind:"phone",isLiveTwoWay:true}}));
      all.push(row("notes",{patientId,program,title:"Monthly care management summary",status:i%3?"signed":"draft",description:`Reviewed ${firstName}'s monitoring trends and self-management goals. Care plan discussed, barriers assessed, and follow-up arranged. Synthetic clinical narrative only.`,metadata:{version:1,signedBy:i%3?"James Anderson":null}}));
      if(i<10) all.push(row("devices",{patientId,program:program==="RPM"?"RPM":"RTM",title:program==="RPM"?"Cellular blood pressure monitor":"Therapeutic monitoring app",status:i===4?"setup_required":"assigned",description:i===4?"Awaiting first successful reading":"Synthetic device connected to simulator",metadata:{serial:`DEMO-${10000+i}`,vendor:"Simulator",battery:85-i*3,connectivity:program==="RPM"?"cellular":"app",setupCompleted:i!==4}}));
      if(i<8) all.push(row("messages",{patientId,program,title:"Care-team conversation",status:"sent",description:i%2?"Thank you for checking in. Please continue following your care plan.":"I completed my exercises today and feel more comfortable.",metadata:{sender:i%2?"Sarah Mitchell":`${firstName} ${lastName}`,direction:i%2?"outbound":"inbound"}}));
    }
    ["threshold","trend","missing_data","adherence","score","time_budget","device_days_at_risk"].forEach((kind,i)=> all.push(row("rules",{title:kind.replaceAll("_"," ").replace(/^./,c=>c.toUpperCase()),program:i%2?"RTM":"RPM",description:"Configurable synthetic-demo rule; clinician approval required before live use.",metadata:{kind,threshold:i===0?180:3,owner:"care_manager",version:1,verified:false}})));
    await s.insert(records).values(all);
  });
  logger.info("Synthetic demo practice seeded");
}

export async function ensurePatientDemoAccount() {
  const { eq, asc }=await import("drizzle-orm");
  const exists=await db.select({id:users.id}).from(users).where(eq(users.email,"patient@mahalo.care")).limit(1);
  if(exists.length) return;
  const [patient]=await db.select().from(patients).orderBy(asc(patients.createdAt)).limit(1);
  if(!patient) return;
  await db.insert(users).values({id:"demo-patient",email:"patient@mahalo.care",name:`${patient.firstName} ${patient.lastName}`,credential:"patient",role:"patient",patientId:patient.id,passwordHash:await hashPassword("MahaloDemo2026!")}).onConflictDoNothing();
}
