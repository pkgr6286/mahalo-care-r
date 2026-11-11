import test from "node:test";
import assert from "node:assert/strict";
import {instrumentContentHash,instrumentAvailable} from "./content-review";

/** PostgreSQL JSONB orders object keys by length, then by value; arrays retain order. */
function jsonbShape(value:unknown):any {
  if(Array.isArray(value))return value.map(jsonbShape);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.length-b.length||(a<b?-1:a>b?1:0)).map(([k,v])=>[k,jsonbShape(v)]));
  return value;
}
function questionnaire(){
  const r={title:"Care routine confidence",description:"Original fictional practice questionnaire",program:"RPM",status:"active",metadata:{
    key:"routine",questions:["How confident are you following your care routine?"],
    contentVersion:"1",instructions:"Think about the last seven days.",answerLabels:["Not yet","Somewhat","Confident"],
    range:{min:0,max:2},scoring:{method:"sum",factor:1,bands:[{min:0,max:1,label:"Needs support"},{min:2,max:2,label:"Confident"}]},
    nonValidatedDemo:true,language:"en",sourceRef:"Original fictional practice content",
    licenseNote:"Original synthetic content approved only for local demonstration, not a validated clinical instrument.",
    contentApprovedForUse:true,fingerprintVersion:3,
  } as Record<string,unknown>};
  r.metadata.contentReviewHash=instrumentContentHash(r);
  return r;
}
test("questionnaire approval survives JSONB object-key ordering including nested scoring bands",()=>{
  const r=questionnaire(),stored={...r,metadata:jsonbShape(r.metadata)};
  assert.notEqual(JSON.stringify(r.metadata.range),JSON.stringify(stored.metadata.range));
  assert.equal(instrumentContentHash(r),instrumentContentHash(stored));
  assert.equal(instrumentAvailable(stored),true);
});
test("canonical approval still rejects changes to wording, anchors, recall period or scoring",()=>{
  const r=questionnaire();
  for(const patch of [
    {questions:["A materially different question"]},
    {answerLabels:["Never","Sometimes","Always"]},
    {instructions:"Think about today only."},
    {scoring:{method:"sum",factor:2}},
    {range:{min:0,max:4}},
    {language:"es"},
  ]){
    assert.equal(instrumentAvailable({...r,metadata:{...r.metadata,...patch}}),false);
  }
});
