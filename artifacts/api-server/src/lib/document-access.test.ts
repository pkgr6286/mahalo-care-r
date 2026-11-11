import {test} from "node:test";
import assert from "node:assert/strict";
import {isReleasedPatientDocument} from "./document-access";
test("Patients can access released care plans and consent records, not private or discarded drafts",()=>{
  for(const status of ["active","superseded","closed"]) assert.equal(isReleasedPatientDocument({kind:"careplans",status}),true);
  for(const status of ["captured","revoked"]) assert.equal(isReleasedPatientDocument({kind:"consents",status}),true);
  for(const status of ["draft","cancelled","pending","unknown"]) assert.equal(isReleasedPatientDocument({kind:"careplans",status}),false);
  for(const kind of ["notes","billing","drafts"]) assert.equal(isReleasedPatientDocument({kind,status:"signed"}),false);
});
