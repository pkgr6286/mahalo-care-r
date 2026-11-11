import test from "node:test";
import assert from "node:assert/strict";
import {ehrMatchHash,resolveFixtureEhrMatch} from "./ehr-matching";
const patient={id:"patient",mrn:"APP-1",firstName:"Synthetic",lastName:"Person",dob:"1980-01-01"};
const candidate={id:"fixture-patient",mrn:"EHR-1",firstName:"Synthetic",lastName:"Person",dob:"1980-01-01"};
const confirmation=()=>({confirmed:true as const,candidateId:candidate.id,matchHash:ehrMatchHash(patient,candidate),reason:"Compared the original synthetic demographics manually."});
test("EHR confirmation hashes bind both identities, not only an external identifier",()=>{
  const h=ehrMatchHash(patient,candidate);
  assert.notEqual(h,ehrMatchHash({...patient,firstName:"Changed"},candidate));
  assert.notEqual(h,ehrMatchHash(patient,{...candidate,mrn:"Changed"}));
  assert.equal(h.length,64);
});
test("exact MRN and DOB can link automatically but a fixture can never cross patients",()=>{
  assert.equal(resolveFixtureEhrMatch(patient,{...candidate,mrn:patient.mrn}).matchedBy,"mrn");
  assert.throws(()=>resolveFixtureEhrMatch(patient,{...candidate,id:"fixture-other"}));
});
test("a nonmatching MRN requires explicit identity confirmation before resources may link",()=>{
  assert.equal(resolveFixtureEhrMatch(patient,candidate).status,"confirmation_required");
  const r=resolveFixtureEhrMatch(patient,candidate,confirmation());
  assert.equal(r.status,"matched");assert.equal(r.matchedBy,"confirmed_name_dob");
});
test("stale hashes and substituted candidate identifiers are rejected",()=>{
  assert.throws(()=>resolveFixtureEhrMatch(patient,candidate,{...confirmation(),matchHash:"0".repeat(64)}));
  assert.throws(()=>resolveFixtureEhrMatch(patient,candidate,{...confirmation(),candidateId:"fixture-other"}));
  assert.throws(()=>resolveFixtureEhrMatch({...patient,lastName:"New name"},candidate,confirmation()));
});
test("unchanged identity confirmations may refresh, but the explicit demonstration still requires a fresh comparison",()=>{
  const prior={matchHash:ehrMatchHash(patient,candidate),confirmedById:"real-reviewer"};
  assert.equal(resolveFixtureEhrMatch(patient,candidate,undefined,prior).reusePrior,true);
  assert.equal(resolveFixtureEhrMatch(patient,candidate,undefined,prior,true).status,"confirmation_required");
});
test("different dates of birth cannot be overridden even with exact MRN or a correct confirmation hash",()=>{
  const wrong={...candidate,mrn:patient.mrn,dob:"1981-01-01"};
  assert.equal(resolveFixtureEhrMatch(patient,wrong).status,"match_blocked");
  assert.throws(()=>resolveFixtureEhrMatch(patient,wrong,{...confirmation(),matchHash:ehrMatchHash(patient,wrong)}));
});
