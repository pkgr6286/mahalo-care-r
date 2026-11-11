import test from "node:test";
import assert from "node:assert/strict";
import {latestPatientContact} from "./patient-contact";
const row={kind:"interactions",status:"completed",date:"2026-11-11T00:00:00.000Z",metadata:{}};
test("EHR identity/cache events and simulated interactions are not patient contact",()=>{
  assert.equal(latestPatientContact([
    {...row,metadata:{kind:"ehr_sync"}},{...row,metadata:{kind:"ehr_match_pending"}},
    {...row,metadata:{simulated:true}},{...row,metadata:{driver:"stub"}},
  ]),"");
  assert.equal(latestPatientContact([]),"");
});
test("latest contact derives only from a completed actual interaction",()=>{
  assert.equal(latestPatientContact([
    {...row,metadata:{kind:"ehr_sync"},date:"2026-11-12T00:00:00.000Z"},
    {...row,date:"2026-11-10T00:00:00.000Z"},
    row,{...row,status:"pending",date:"2026-11-13T00:00:00.000Z"},
  ]),row.date);
});
