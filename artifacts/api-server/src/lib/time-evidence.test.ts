import {test} from "node:test";
import assert from "node:assert/strict";
import {timeEvidence} from "./time-evidence";
test("Frozen time evidence matches monitoring, care-management and practitioner buckets",()=>{
  const sources={eligible:["nurse","physician"],staff:["nurse"],practitioner:["physician"]},staff={requires:{minutes_min:20},minutes_bucket:"staff"};
  for(const program of ["RPM","RTM"]) assert.deepEqual(timeEvidence(program,staff,sources),sources.eligible);
  for(const program of ["CCM","PCM","BHI"]) assert.deepEqual(timeEvidence(program,staff,sources),sources.staff);
  assert.deepEqual(timeEvidence("CCM",{...staff,minutes_bucket:"practitioner"},sources),sources.practitioner);
  assert.deepEqual(timeEvidence("RPM",{requires:{},minutes_bucket:"staff"},sources),[]);
});
