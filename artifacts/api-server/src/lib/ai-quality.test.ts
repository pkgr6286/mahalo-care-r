import {test} from "node:test";
import assert from "node:assert/strict";
import {buildNumericEvidence,assessNumericText,editMetrics} from "./ai-quality";
const source=(id:string,kind:string,value:number,unit:string,metadata:Record<string,unknown>={},status="completed")=>({id,kind,value,unit,metadata,status});
const evidence=buildNumericEvidence([source("bp","observations",150,"mmHg",{diastolic:95}),source("invalid","observations",999,"mmHg",{valid:false}),source("time","time",20,"min",{},"committed"),source("void","time",100,"min",{},"voided"),source("phq","responses",12,"points",{instrument:"phq9"}),source("alert","exceptions",0,"",{},"open")],["Metformin 500 mg daily"]);
test("AI source checks recognize actual blood pressure, scores, medication literals and exact recorded time",()=>{
  for(const text of ["BP 150/95 mmHg.","PHQ-9 score: 12.","Documented activity: 20 minutes.","Metformin 500 mg.","1 valid observation and 1 unresolved exception."]) assert.equal(assessNumericText(text,evidence).unsupported.length,0,text);
});
test("AI source checks reject invented values, swapped BP components, invalid readings and voided time",()=>{
  for(const text of ["BP 150/90 mmHg.","BP 95/150 mmHg.","PHQ-9 score: 20.","100 minutes.","999 mmHg.","Metformin 900 mg.","2 valid observations."]) assert.ok(assessNumericText(text,evidence).unsupported.length,text);
});
test("AI source checks describe their limited scope and do not claim clinical validation",()=>{
  const result=assessNumericText("A clinician must review the plan.",evidence);
  assert.equal(result.status,"no_numeric_claims");assert.match(result.scope,/not complete factual or clinical validation/);
});
test("AI edit reporting records real Levenshtein distance, including unchanged and empty strings",()=>{
  assert.deepEqual(editMetrics("abc","adc"),{edited:true,editDistance:1,editRatio:1/3});assert.equal(editMetrics("same","same").edited,false);assert.equal(editMetrics("","").editRatio,0);
});
