import {test} from "node:test";
import assert from "node:assert/strict";
import {matchEhrPatient} from "./ehr-adapter";
const p={mrn:"MC-1",firstName:"Synthetic",lastName:"Patient",dob:"1960-01-01"};
const identity={...p,id:"fhir-1"};
test("EHR matching prefers unique MRN and never silently links name plus DOB",()=>{
  assert.equal(matchEhrPatient(p,[identity]).status,"matched");
  assert.equal(matchEhrPatient(p,[{...identity,mrn:"DIFFERENT"}]).status,"confirmation_required");
  assert.equal(matchEhrPatient(p,[identity,{...identity,id:"fhir-2"}]).status,"ambiguous");
  assert.equal(matchEhrPatient(p,[{...identity,mrn:"DIFFERENT",dob:"1970-01-01"}]).status,"unmatched");
});
