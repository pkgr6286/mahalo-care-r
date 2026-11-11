import test from "node:test";
import assert from "node:assert/strict";
import {publicScreener,publicScreenerQuestions} from "./public-screeners";
import {scoreInstrument} from "./instrument-scoring";
import {instrumentContentHash,reviewedContentMetadata} from "./content-review";

test("public-source English PHQ-9/GAD-7 retain recall, anchors and exact scoring",()=>{
  const phq=publicScreener("phq9",new Date("2026-11-11T12:00:00Z"));
  assert.equal(publicScreenerQuestions.phq9.length,9);assert.equal(publicScreenerQuestions.gad7.length,7);
  assert.match(String(phq.metadata.instructions),/last 2 weeks/);
  assert.deepEqual(phq.metadata.answerLabels,["Not at all","Several days","More than half the days","Nearly every day"]);
  const result=scoreInstrument("phq9",phq.metadata,[3,3,3,3,3,3,3,0,0]);
  assert.equal(result.score,21);assert.equal(result.band,"severe");assert.equal(result.nonValidatedDemo,false);
  const gad=publicScreener("gad7",new Date());assert.equal(scoreInstrument("gad7",gad.metadata,Array(7).fill(3)).score,21);
});
test("questionnaire approval binds the recall stem, answer anchors and language",()=>{
  const original=publicScreener("phq9",new Date()),hash=instrumentContentHash(original);
  for(const patch of [{instructions:"Over the last day"},{answerLabels:["Never","Sometimes","Often","Always"]},{language:"es"}]) {
    assert.notEqual(instrumentContentHash({...original,metadata:{...original.metadata,...patch}}),hash);
  }
  assert.throws(()=>reviewedContentMetadata("instruments",{metadata:{questions:[{unexpected:"object"}]}},{id:"actor",role:"admin",credential:"admin",name:"Configuration reviewer",email:"reviewer@example.test"}),/nonblank text/);
  assert.equal(scoreInstrument("phq9",{},Array(9).fill(0)).nonValidatedDemo,true,"Empty placeholder content is never a validated questionnaire");
});
