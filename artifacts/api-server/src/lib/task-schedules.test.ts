import {test} from "node:test";
import assert from "node:assert/strict";
import {scheduleMatches,localHourInstant,validateSchedule} from "./task-schedules";
import {planValidationErrors} from "./careplan-validation";

test("daily intervals and weekly schedules materialize only due days",()=>{
  assert.equal(scheduleMatches("FREQ=DAILY;INTERVAL=2","2026-11-13","2026-11-11"),true);
  assert.equal(scheduleMatches("FREQ=DAILY;INTERVAL=2","2026-11-12","2026-11-11"),false);
  assert.equal(scheduleMatches("FREQ=WEEKLY;BYDAY=MO,WE,FR","2026-11-13","2026-11-11"),true);
  assert.equal(scheduleMatches("FREQ=WEEKLY;BYDAY=MO,WE,FR","2026-11-14","2026-11-11"),false);
  assert.throws(()=>validateSchedule("FREQ=MONTHLY"));
  assert.throws(()=>validateSchedule("FREQ=DAILY;INTERVAL=0"));
  assert.throws(()=>validateSchedule("FREQ=WEEKLY;BYDAY=BAD"));
});
test("local task time survives daylight-saving and non-whole-hour offsets",()=>{
  assert.equal(localHourInstant("2026-11-01",12,"America/New_York"),"2026-11-01T17:00:00.000Z");
  assert.equal(localHourInstant("2026-03-08",12,"America/New_York"),"2026-03-08T16:00:00.000Z");
  assert.equal(localHourInstant("2026-11-11",12,"Asia/Kolkata"),"2026-11-11T06:30:00.000Z");
});
test("structured plan validation enforces shared and program-specific requirements",()=>{
  const plan={program:"CCM",description:"Comprehensive synthetic care plan",metadata:{schemaVersion:2,problems:["Hypertension","Diabetes"],goals:"Stable monitoring",interventions:"Daily review",medications:[],reconciledAt:"2026-01-01",expectedOutcome:"Support sustained self-management with a coordinated monthly review.",careTeam:["RN"],reviewDays:30}};
  assert.deepEqual(planValidationErrors(plan,{conditions:["Hypertension","Diabetes"]}),[]);
  assert.ok(planValidationErrors({...plan,metadata:{...plan.metadata,expectedOutcome:"Short"}},{conditions:[]}).some(e=>e.includes("40")));
  assert.ok(planValidationErrors({...plan,program:"RPM"},{conditions:[]}).some(e=>e.includes("monitoredParameters")));
  assert.ok(planValidationErrors({...plan,program:"PCM"},{conditions:[]}).some(e=>e.includes("qualifyingCondition")));
});
