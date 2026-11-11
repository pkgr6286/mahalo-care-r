import { test } from "node:test";
import assert from "node:assert/strict";
import {scoreInstrument} from "./instrument-scoring";
test("standard scores have instrument-specific bands and valid integer answers",()=>{
  assert.equal(scoreInstrument("phq9",{},[3,3,3,3,3,3,3,0,0]).band,"severe");
  assert.equal(scoreInstrument("gad7",{},[2,2,2,2,2,0,0]).band,"moderate");
  assert.equal(scoreInstrument("odi",{},Array(10).fill(2)).score,40);
  assert.throws(()=>scoreInstrument("gad7",{},Array(7).fill(3.5)));
  assert.throws(()=>scoreInstrument("phq9",{questions:["a","b"]},[1,1]),/original item count/);
});
test("configured questionnaires calculate sums, means and normalized percentages",()=>{
  const base={questions:["a","b"],range:{min:1,max:5}};
  assert.equal(scoreInstrument("custom",{...base,scoring:{method:"mean"}},[2,3]).score,2.5);
  assert.equal(scoreInstrument("custom",{...base,scoring:{method:"percentage"}},[3,3]).score,50);
  assert.throws(()=>scoreInstrument("custom",base,[0,1]));
});
test("lookup scoring requires actual approved mappings; missing values never get a made-up score",()=>{
  const metadata={questions:["a"],range:{min:0,max:3},scoring:{method:"lookup",lookup:[{raw:2,score:51.6}]}};
  assert.equal(scoreInstrument("promis_local",metadata,[2]).score,51.6);
  assert.throws(()=>scoreInstrument("promis_local",metadata,[1]),/does not cover/);
});
test("overlapping interpretation bands fail explicitly",()=>{
  assert.throws(()=>scoreInstrument("custom",{questions:["a"],range:{min:0,max:4},scoring:{method:"sum",bands:[{min:0,max:2,label:"a"},{min:2,max:4,label:"b"}]}},[1]),/overlap/);
});
