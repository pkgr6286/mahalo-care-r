export type DemoFamily = "RPM" | "RTM" | "CCM" | "PCM" | "BHI";
type Problem = {code:string;display:string};
type Medication = {name:string;dose:string;frequency:string;indication:string;rxnormCode?:string};
export type ClinicalDemoCase = {
  firstName:string;lastName:string;family:DemoFamily;problems:Problem[];medications:Medication[];
  goal:string;barrier:string;plan:string;recent:string;next:string;measure:string;incomingMessage:string;
};
const names = [
  ["Margaret","Wilson"],["Robert","Thompson"],["Patricia","Garcia"],["James","Miller"],["Linda","Davis"],["William","Martinez"],
  ["Barbara","Anderson"],["Richard","Taylor"],["Susan","Thomas"],["Joseph","Moore"],["Jessica","Jackson"],["Charles","Martin"],
  ["Nancy","Lee"],["Thomas","Perez"],["Karen","White"],["Christopher","Harris"],["Lisa","Clark"],["Daniel","Lewis"],
  ["Betty","Robinson"],["Matthew","Walker"],["Sandra","Hall"],["Anthony","Young"],["Donna","Allen"],["Mark","King"],
  ["Carol","Wright"],["Steven","Scott"],["Ruth","Green"],["Paul","Adams"],["Sharon","Baker"],["Andrew","Nelson"],
] as const;
const htn={code:"I10",display:"Essential hypertension"},diabetes={code:"E11.9",display:"Type 2 diabetes mellitus without complications"};
const recipes:Record<DemoFamily,Omit<ClinicalDemoCase,"firstName"|"lastName"|"family"|"incomingMessage">> = {
  RPM: {
    problems:[htn,diabetes],
    medications:[{name:"Amlodipine",dose:"5 mg",frequency:"once daily",indication:"Blood pressure",rxnormCode:"329528"},{name:"Metformin",dose:"500 mg",frequency:"twice daily with meals",indication:"Type 2 diabetes",rxnormCode:"861007"}],
    goal:"Record a home blood pressure on at least 5 days each week and review the trend with the care team.",
    barrier:"Occasionally forgets the morning reading when caring for a family member.",
    plan:"Review the home monitoring technique and medication list. Agree a consistent reading routine, assess symptoms with any out-of-range result, and review the trend at the next care-team contact.",
    recent:"Home readings are available for review. The patient described their usual medication routine and agreed to keep a written record of missed doses for the next conversation.",
    next:"Review the latest home readings and confirm the patient's preferred follow-up time.",
    measure:"blood pressure",
  },
  RTM: {
    problems:[{code:"M54.50",display:"Chronic low back pain"},{code:"M17.11",display:"Primary osteoarthritis of right knee"}],
    medications:[{name:"Acetaminophen",dose:"500 mg",frequency:"as prescribed, up to twice daily as needed",indication:"Musculoskeletal pain"}],
    goal:"Walk for 15 minutes with one rest break and improve comfort during everyday activities over the next month.",
    barrier:"An increase in pain after gardening interrupted the usual exercise routine.",
    plan:"Follow the therapist-authored home program already agreed with the patient. Track pain and function, review barriers to participation, and adjust the prescribed program only after therapist review.",
    recent:"The patient is tracking pain and daily activity. They can now walk to the end of the block and would like to return to gardening without a next-day flare.",
    next:"Therapist to review the exercise log and discuss pacing at the next scheduled contact.",
    measure:"pain",
  },
  CCM: {
    problems:[diabetes,htn,{code:"E78.5",display:"Hyperlipidemia"}],
    medications:[{name:"Metformin",dose:"500 mg",frequency:"twice daily with meals",indication:"Type 2 diabetes",rxnormCode:"861007"},{name:"Losartan",dose:"50 mg",frequency:"once daily",indication:"Blood pressure"},{name:"Atorvastatin",dose:"20 mg",frequency:"at bedtime",indication:"Hyperlipidemia"}],
    goal:"Maintain an up-to-date medication list, attend scheduled follow-ups and identify one practical self-management priority each month.",
    barrier:"Transportation and prescription pickup need to be coordinated with the patient's daughter.",
    plan:"Coordinate primary-care and specialist follow-up, reconcile medications, review practical barriers and document the patient's priorities. Share an updated care summary with the patient.",
    recent:"Medication reconciliation was completed with the patient. Prescription pickup and transport for the next appointment were discussed with the patient's permission.",
    next:"Confirm prescription pickup and the next primary-care appointment.",
    measure:"glucose",
  },
  PCM: {
    problems:[{code:"J44.9",display:"Chronic obstructive pulmonary disease"}],
    medications:[{name:"Tiotropium",dose:"18 mcg",frequency:"one inhalation daily as prescribed",indication:"COPD maintenance"},{name:"Albuterol inhaler",dose:"90 mcg per actuation",frequency:"as prescribed for symptoms",indication:"Rescue inhaler"}],
    goal:"Understand the agreed symptom action plan and complete scheduled respiratory follow-up without avoidable gaps in care.",
    barrier:"The patient is uncertain which inhaler is for maintenance and which is for symptom relief.",
    plan:"Review the existing respiratory action plan and inhaler list, coordinate follow-up with the treating clinician, and check understanding of when and how to contact the care team.",
    recent:"The patient described their current symptom pattern and reviewed the names and purpose of the inhalers on their prescribed list. No change to the prescription was made in this care-management contact.",
    next:"Arrange a respiratory-nurse follow-up to review the prescribed inhaler technique and the existing action plan.",
    measure:"oxygen saturation",
  },
  BHI: {
    problems:[{code:"F33.1",display:"Major depressive disorder, recurrent, moderate"},{code:"F41.1",display:"Generalized anxiety disorder"}],
    medications:[{name:"Sertraline",dose:"50 mg",frequency:"once daily as prescribed",indication:"Depression and anxiety"}],
    goal:"Reconnect with one valued activity each week and review symptom measures and treatment preferences with the behavioral care team.",
    barrier:"Poor sleep and reduced motivation make it difficult to maintain a regular routine.",
    plan:"Document the patient's goals, follow symptom measures, coordinate with the treating clinician and arrange consultant review where indicated. Keep a clear, patient-specific follow-up and safety-contact plan.",
    recent:"The patient discussed sleep, mood and a wish to resume regular walks with a friend. The care manager reviewed treatment preferences and arranged the next follow-up.",
    next:"Behavioral care manager to follow up on the agreed activity goal and repeat the scheduled symptom check-in.",
    measure:"mood",
  },
};
const incomingMessages=[
  "I would like the team to review my recent home blood-pressure readings and confirm when we should talk next.",
  "My shoes feel tighter, and the scale readings have gone up. Please help me get the weight trend reviewed.",
  "I am trying to take my blood-pressure reading at the same time each day. Could we check my cuff routine at our next call?",
  "Could we discuss when to do my glucose checks around meals? My meal times have been less predictable.",
  "I have kept my home readings. I would like to go through the numbers with the nurse before my next visit.",
  "My home monitor has not sent a reading for a few days. Can someone help check the connection?",
  "My back was more sore after gardening. Could the therapist help me pace my home exercises?",
  "I am finding the knee exercises hard to keep up with. I still want to walk to the local shop with fewer stops.",
  "I can walk to the end of the block, but I still need a rest. How should I record that in my home-program log?",
  "I would like to discuss which activities tend to flare my back pain before the next therapy session.",
  "I have been using the activity log. Could we review my walking goal together at the next contact?",
  "Getting back to gardening is still important to me. I want to avoid doing too much on a good day.",
  "I have a question about fitting my medicine routine around my meals. Could we review it at our next call?",
  "Can you help me confirm the next primary-care appointment and what I should bring from my home records?",
  "I need help arranging transport and collecting my prescription before the next visit.",
  "I would like to go through my current medicines together so I can keep one clear list.",
  "I want a more reliable way to remember my prescribed doses when my daily routine changes.",
  "Please let me know who to contact if I have a question between my primary-care visits.",
  "Could we go over the maintenance inhaler and the symptom-relief inhaler again? I want to follow the plan correctly.",
  "I would like to check my inhaler technique at the respiratory-nurse follow-up.",
  "Please help me confirm the heart-failure specialist appointment and review the symptom plan agreed with my clinician.",
  "Can we review when to use the care-team contact route in my breathing action plan?",
  "I have my inhaler list ready. Could we check that I understand what each prescribed inhaler is for?",
  "I would like my next respiratory follow-up confirmed so there is no gap in the agreed plan.",
  "I would like to get back to regular walks with my friend. Could we agree one small activity goal for this week?",
  "My sleep routine is still difficult. Could we discuss it alongside the mood check-in?",
  "I have completed the mood questions. Please arrange a time to talk through how I have been feeling.",
  "Getting started in the morning is difficult. I want to review a manageable daily routine with the behavioral care team.",
  "Can we talk about the treatment preferences I shared before the next consultant review?",
  "I would like help choosing an activity I can keep up with, rather than setting a goal that is too big.",
] as const;
if(incomingMessages.length!==names.length)throw new Error("Every fictional clinical case needs its own conversation");
export const clinicalDemoCases:ClinicalDemoCase[] = names.map(([firstName,lastName],i)=>{
  const family=(["RPM","RTM","CCM","PCM","BHI"] as const)[Math.floor(i/6)]!;
  const base=structuredClone(recipes[family]);
  if(i===1) Object.assign(base,{
    problems:[{code:"I50.32",display:"Chronic diastolic heart failure"},htn],
    medications:[{name:"Furosemide",dose:"20 mg",frequency:"once daily as prescribed",indication:"Heart failure"},{name:"Losartan",dose:"50 mg",frequency:"once daily",indication:"Blood pressure"}],
    goal:"Follow the treating clinician's weight-monitoring plan and report changes through the agreed care-team contact route.",
    barrier:"A household-scale battery failure interrupted two days of measurements.",
    recent:"The home weight trend shows an increase over the last three recorded days. The patient reported tighter shoes during the care-team conversation; clinician review is pending.",
    next:"Review the weight trend and reported swelling with the treating clinician today.",measure:"weight",
  });
  if(i===3) {base.measure="glucose";base.goal="Record the prescribed glucose checks and discuss meal-timing barriers with the diabetes care team.";}
  if(i===7) {base.problems=[{code:"M17.12",display:"Primary osteoarthritis of left knee"}];base.goal="Walk to the local shop with improved comfort and no more than one planned rest break.";}
  if(i===20) {base.problems=[{code:"I50.22",display:"Chronic systolic heart failure"}];base.medications=[{name:"Carvedilol",dose:"6.25 mg",frequency:"twice daily as prescribed",indication:"Heart failure"}];base.measure="weight";base.goal="Understand the specialist's symptom plan and attend the planned heart-failure follow-up.";base.plan="Coordinate the established heart-failure plan, confirm medication reconciliation and document the patient's symptom and follow-up priorities.";base.barrier="The patient needs help confirming the heart-failure specialist appointment and understanding the existing symptom-contact plan.";base.recent="The patient reviewed the prescribed heart-failure medication list and follow-up priorities with the care manager. The specialist appointment still needs confirmation; no prescription change was made.";base.next="Confirm the heart-failure specialist follow-up and review the existing symptom action plan.";}
  return {firstName,lastName,family,...base,incomingMessage:incomingMessages[i]!};
});
