import test from "node:test";
import assert from "node:assert/strict";
import {parseWorklistQuery,WorklistFiltersSchema,isStaffCareTask} from "./worklist-filters";
import {validateReference} from "./reference-validation";
test("worklists parse URL values, restore saved filters and explicitly clear saved selections",()=>{
  const saved={q:"Avery",program:"BHI",locations:["Garden City"],pageSize:50,status:"all"};
  const restored=parseWorklistQuery({kind:"cocm_registry",page:"2"},saved);
  assert.equal(restored.page,2);assert.equal(restored.filters.program,"BHI");assert.equal(restored.filters.pageSize,50);
  const cleared=parseWorklistQuery({kind:"tasks",q:"",program:"",locations:"",period:"",includeInactive:"false"},saved);
  assert.equal(cleared.filters.q,"");assert.equal(cleared.filters.program,"");assert.deepEqual(cleared.filters.locations,[]);assert.equal(cleared.filters.includeInactive,false);
  assert.deepEqual(saved.locations,["Garden City"]);
});
test("worklists reject malformed paging, periods, boolean values and unrecognized parameters",()=>{
  for(const input of [{page:"0"},{pageSize:"101"},{includeInactive:"0"},{period:"overdue"},{period:"2026-13"},{patientId:"forged"},{kind:"unknown"}]) assert.throws(()=>parseWorklistQuery({kind:"team_queue",...input}));
  assert.throws(()=>WorklistFiltersSchema.parse({program:"unknown"}));
  assert.deepEqual(parseWorklistQuery({kind:"tasks",locations:"Garden City,Babylon,Garden City"}).filters.locations,["Garden City","Babylon"]);
});
test("worklists distinguish staff work from medication, reading and other patient activities",()=>{
  assert.equal(isStaffCareTask({audience:"staff",taskKind:"review"}),true);
  assert.equal(isStaffCareTask({kind:"callback"}),true);
  for(const m of [{audience:"patient"},{taskKind:"reading"},{kind:"medication"},{type:"exercise"},{adherenceKind:"education"}]) assert.equal(isStaffCareTask(m),false);
});
test("staff task due dates require real calendar dates and explicit timezones",()=>{
  for(const dueAt of ["Tomorrow","2026-02-31T12:00:00Z","2026-11-11T12:00:00","2026-13-11T12:00:00Z",42]) assert.throws(()=>validateReference("tasks",{metadata:{dueAt}}));
  for(const dueAt of ["2026-11-11T12:00:00Z","2026-11-11T12:00:00.123Z","2026-11-11T12:00+05:30",null]) assert.doesNotThrow(()=>validateReference("tasks",{metadata:{dueAt}}));
  assert.throws(()=>validateReference("interactions",{metadata:{kind:"consultant_review"}}));
});
