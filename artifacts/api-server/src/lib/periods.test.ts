import {test} from "node:test";
import assert from "node:assert/strict";
import {rollingSupplyWindow,countDeviceDays,localDay} from "./periods";
test("A date-only supply anchor is a patient-local calendar date, not UTC midnight",()=>{
  assert.equal(rollingSupplyWindow("2026-03-01",new Date("2026-03-15T15:00:00Z"),"America/New_York").startDay,"2026-03-01");
});
test("a 30-day supply window is distinct from the calendar month",()=>{
  const w=rollingSupplyWindow("2026-01-20T12:00:00Z",new Date("2026-03-01T12:00:00Z"),"America/New_York");
  assert.deepEqual(w,{startDay:"2026-01-20",endDayExclusive:"2026-02-19",complete:true});
});
test("a not-yet-completed supply window cannot claim completion",()=>{
  assert.equal(rollingSupplyWindow("2026-02-01T12:00:00Z",new Date("2026-02-20T12:00:00Z"),"America/New_York").complete,false);
});
test("patient-local days are deduplicated at midnight boundaries",()=>{
  assert.equal(localDay("2026-06-15T02:00:00Z","America/New_York"),"2026-06-14");
  assert.equal(countDeviceDays([{date:"2026-06-15T02:00:00Z"},{date:"2026-06-14T22:00:00Z"}],"America/New_York"),1);
  assert.equal(countDeviceDays([{date:"2026-06-15T02:00:00Z"},{date:"2026-06-15T12:00:00Z"}],"America/New_York"),2);
});
test("supply boundaries remain thirty local calendar dates across DST",()=>{
  const w=rollingSupplyWindow("2026-03-01T12:00:00Z",new Date("2026-04-03T12:00:00Z"),"America/New_York");
  assert.deepEqual(w,{startDay:"2026-03-01",endDayExclusive:"2026-03-31",complete:true});
});
