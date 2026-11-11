import {db,records} from "@workspace/db";
/** Original application instructions only; deliberately not clinical or licensed questionnaire wording. */
export async function ensureEducationDefaults() {
  await db.insert(records).values({
    id:"af0d86b6-99be-42f9-a780-936f5dfb8919",kind:"education",title:"Using your Mahalo Care demo",status:"active",
    description:"A short guide to your plan, check-ins and secure messages. Demonstration instructions, not medical advice.",
    createdBy:"demo-admin",date:new Date().toISOString(),
    metadata:{contentVersion:1,type:"application_guide",sourceRef:"Mahalo Care synthetic demonstration instructions",nonClinical:true,
      licenseNote:"Original application-use instructions written for this synthetic Mahalo Care demonstration, not licensed clinical questionnaire content.",
      body:"This guide explains the demonstration app. It is not medical advice.\n\nOpen My plan to see the programs and tasks assigned by your care team. The data in this environment is synthetic.\n\nUse Check-in to record a demonstration response. Questionnaire wording marked as a placeholder is not a validated clinical assessment.\n\nOpen Messages to contact the demonstration care team. External SMS, email and video delivery are simulated or captured locally; this is not a continuously monitored care service.\n\nAcknowledging this guide records that you read it. It does not record billable time, demonstrate comprehension or confirm that you have been trained to use a medical device.\n\nFor a real emergency, contact your local emergency services. Do not wait for a response through this demonstration app."},
  }).onConflictDoNothing();
}
