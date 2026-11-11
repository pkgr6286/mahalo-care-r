import type { RecordRow, PatientRow } from "@workspace/db";
import { AppError } from "./errors";
import { planItems } from "./task-schedules";

const text=(v:unknown)=>Array.isArray(v)?v.map(String).filter(x=>x.trim()).join("\n"):typeof v==="string"?v.trim():"";
export function planValidationErrors(plan:Pick<RecordRow,"metadata"|"program"|"description">,patient:Pick<PatientRow,"conditions">) {
  const m=plan.metadata,errors:string[]=[];
  if(!plan.description.trim()) errors.push("Plan narrative is required");
  for(const key of ["goals","interventions"]) if(!text(m[key])) errors.push(`${key} must be documented`);
  // Existing imported demo documents remain readable/signable; all newly authored plans use the full schema.
  if(Number(m.schemaVersion??1)<2) return errors;
  if(!Array.isArray(m.problems)||!m.problems.length) errors.push("At least one problem is required");
  if(!Array.isArray(m.medications)) errors.push("Medication reconciliation must include a medication list (empty if none)");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(m.reconciledAt))||!Number.isFinite(Date.parse(String(m.reconciledAt)))||String(m.reconciledAt)>new Date().toISOString().slice(0,10)) errors.push("A valid medication reconciliation date is required");
  if(text(m.expectedOutcome).length<40) errors.push("Expected outcome and prognosis must contain at least 40 characters");
  if(!text(m.careTeam)) errors.push("The coordinating care team is required");
  if(!Number.isInteger(m.reviewDays)||Number(m.reviewDays)<1||Number(m.reviewDays)>365) errors.push("Review interval must be 1–365 days");
  const requireText=(keys:string[])=>{for(const k of keys)if(!text(m[k]))errors.push(`${k} is required for ${plan.program}`);};
  if(plan.program==="CCM"&&(m.problems as unknown[]).length<2) errors.push("CCM requires at least two chronic problems");
  if(plan.program==="PCM") {
    requireText(["qualifyingCondition"]);
    if(!patient.conditions.includes(String(m.qualifyingCondition))) errors.push("Choose the PCM qualifying condition from the patient's problem list");
    if(!Number.isFinite(Number(m.expectedDurationMonths))||Number(m.expectedDurationMonths)<3) errors.push("PCM expected duration must be at least 3 months");
  }
  if(plan.program==="RPM") requireText(["monitoredParameters","readingSchedule","escalationContact"]);
  if(plan.program==="RTM") requireText(["diagnosis","therapyReference","exercises"]);
  if(plan.program==="BHI") requireText(["initialAssessment","scaleKey","referralPath"]);
  try{planItems({...plan,metadata:m} as RecordRow);}catch(error){errors.push(error instanceof Error?error.message:"Invalid scheduled items");}
  return errors;
}
export function assertPlanForSigning(plan:RecordRow,patient:PatientRow) {
  const errors=planValidationErrors(plan,patient);
  if(errors.length) throw new AppError(400,errors.join("; "));
}
