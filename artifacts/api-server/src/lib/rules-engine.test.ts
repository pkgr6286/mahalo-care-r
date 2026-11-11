import {test} from "node:test";
import assert from "node:assert/strict";
import {evaluateRule,type RuleSignal} from "./rules-engine";
const clock=new Date("2026-06-15T12:00:00Z");
const reading=(value:number,date="2026-06-14T12:00:00Z"):RuleSignal=>({date,value,kind:"observations",metadata:{valid:true,source:"device"}});
test("threshold rules exclude invalid observations",()=>{
  assert.equal(evaluateRule({kind:"threshold",threshold:180},[reading(185)],clock).matched,true);
  assert.equal(evaluateRule({kind:"threshold",threshold:180},[{...reading(185),metadata:{valid:false}}],clock).matched,false);
});
test("trend requires the configured minimum sample size",()=>{
  assert.equal(evaluateRule({kind:"trend",threshold:150,minPoints:4},[reading(160),reading(170)],clock).matched,false);
  assert.equal(evaluateRule({kind:"trend",threshold:150,minPoints:2},[reading(160),reading(170)],clock).matched,true);
});
test("missing-data rules respect elapsed days",()=>{
  assert.equal(evaluateRule({kind:"missing_data",days:3},[reading(120)],clock).matched,false);
  assert.equal(evaluateRule({kind:"missing_data",days:3},[reading(120,"2026-06-10T12:00:00Z")],clock).matched,true);
});
test("adherence compares completion rate",()=>{
  const tasks=[0,1,2].map(i=>({date:"2026-06-14T12:00:00Z",value:0,kind:"tasks",metadata:{status:i===0?"completed":"pending"}}));
  assert.equal(evaluateRule({kind:"adherence",rate:0.5},tasks,clock).matched,true);
});
test("score rule requires an actual response",()=>{
  assert.equal(evaluateRule({kind:"score",threshold:15},[],clock).matched,false);
  assert.equal(evaluateRule({kind:"score",threshold:15},[{date:"2026-06-14T12:00:00Z",value:18,kind:"responses",metadata:{}}],clock).matched,true);
});
test("time and device-day risk rules use evidence",()=>{
  assert.equal(evaluateRule({kind:"time_budget",threshold:20},[],clock,{minutes:12,deviceDays:16}).observed,8);
  assert.equal(evaluateRule({kind:"device_days_at_risk",threshold:16},[],clock,{minutes:20,deviceDays:12}).observed,4);
});
