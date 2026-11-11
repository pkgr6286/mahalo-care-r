import {test} from "node:test";
import assert from "node:assert/strict";
import {evaluateRule,type RuleSignal} from "./rules-engine";
import {parseClinicalRule} from "./clinical-rule-schema";
const clock=new Date("2026-06-15T12:00:00Z");
const signal=(id:string,value:number,loinc="8480-6",date="2026-06-15T10:00:00Z"):RuleSignal=>({id,value,date,kind:"observations",metadata:{loinc,valid:true,source:"device"}});
const score=(id:string,value:number,instrument:string,date="2026-06-15T10:00:00Z",extra:Record<string,unknown>={}):RuleSignal=>({...signal(id,value,"",date),kind:"responses",metadata:{instrument,...extra}});
test("Threshold confirmation is parameter-specific, bounded by hours, and deduplicates reading identities",()=>{
  const rule={kind:"threshold",loinc:"8480-6",op:"gte",value:180,confirm_with_n_readings:2,within_hours:4};
  assert.equal(evaluateRule(rule,[signal("a",190),signal("b",190,"2339-0")],clock).matched,false);
  assert.equal(evaluateRule(rule,[signal("a",190),signal("a",190)],clock).matched,false);
  assert.equal(evaluateRule(rule,[signal("a",190),signal("b",190,"8480-6","2026-06-14T10:00:00Z")],clock).matched,false);
  assert.equal(evaluateRule(rule,[signal("a",190),signal("b",190)],clock).matched,true);
});
test("Composite BP rules evaluate diastolic components without applying BP cutoffs to glucose",()=>{
  const rule={kind:"threshold",any_of:[{loinc:"8480-6",op:"gte",value:180},{loinc:"8462-4",op:"gte",value:120}]};
  assert.equal(evaluateRule(rule,[{...signal("a",135),metadata:{loinc:"8480-6",valid:true,diastolic:125}}],clock).matched,true);
  assert.equal(evaluateRule(rule,[signal("b",200,"2339-0")],clock).matched,false);
});
test("Comparison grammar preserves strict and inclusive boundaries",()=>{
  for(const [op,value,expected] of [["gt",180,false],["gte",180,true],["lt",180,false],["lte",180,true]] as const) assert.equal(evaluateRule({kind:"threshold",op,value:180},[signal(op,value)],clock).matched,expected);
  assert.equal(evaluateRule({kind:"threshold",op:"outside",low:70,high:300},[signal("a",70)],clock).matched,false);
});
test("Trend statistics include actual elapsed-day slopes, maxima and change",()=>{
  const points=[signal("a",120,"8480-6","2026-06-11T10:00:00Z"),signal("b",130,"8480-6","2026-06-13T10:00:00Z"),signal("c",140)];
  assert.equal(evaluateRule({kind:"trend",loinc:"8480-6",stat:"slope",op:"gte",value:5,min_points:3},points,clock).observed,5);
  assert.equal(evaluateRule({kind:"trend",loinc:"8480-6",stat:"max",value:140,min_points:3},points,clock).matched,true);
  assert.equal(evaluateRule({kind:"trend",loinc:"8480-6",stat:"delta",value:20,min_points:3},points,clock).observed,20);
});
test("Missing-data grace uses enrollment time, excludes invalid/future data, and isolates streams",()=>{
  const rule={kind:"missing_data",stream:"device",days_without:3,only_if_enrolled_days_gte:3};
  assert.equal(evaluateRule(rule,[],clock,{minutes:0,deviceDays:0,enrolledAt:"2026-06-14T12:00:00Z"}).matched,false);
  assert.equal(evaluateRule(rule,[score("s",0,"phq9")],clock,{minutes:0,deviceDays:0,enrolledAt:"2026-06-01T12:00:00Z"}).matched,true);
  assert.equal(evaluateRule(rule,[{...signal("a",120),metadata:{source:"device",valid:false}}],clock,{minutes:0,deviceDays:0,enrolledAt:"2026-06-01T12:00:00Z"}).matched,true);
});
test("Adherence is item-specific and supports consecutive misses and coded barriers",()=>{
  const events=[{...signal("a",0),kind:"tasks",metadata:{kind:"exercise",status:"skipped",barrier:"too_painful"}},{...signal("b",0),kind:"tasks",metadata:{kind:"exercise",status:"missed"}}];
  assert.equal(evaluateRule({kind:"adherence",item_kind:"medication",completion_rate_lt:0.5},events,clock).matched,false);
  assert.equal(evaluateRule({kind:"adherence",item_kind:"exercise",missed_consecutive_gte:2},events,clock).matched,true);
  assert.equal(evaluateRule({kind:"adherence",barrier_in:["too_painful"]},events,clock).matched,true);
});
test("Scores isolate instruments, support item flags, bands and prior/baseline worsening",()=>{
  const events=[score("a",5,"phq9","2026-06-15T10:00:00Z",{answers:[0,0,0,0,0,0,0,0,1]}),score("b",25,"gad7")];
  assert.equal(evaluateRule({kind:"score",instrument_key:"phq9",value:20},events,clock).matched,false);
  assert.equal(evaluateRule({kind:"score",instrument_key:"phq9",item_flag:{index:9,op:"gt",value:0}},events,clock).matched,true);
  assert.equal(evaluateRule({kind:"score",instrument_key:"gad7",band_in:["severe"]},[score("c",18,"gad7",undefined,{band:"Severe"})],clock).matched,true);
  const pain=[score("n",8,"pain_nrs"),score("p",6,"pain_nrs","2026-06-14T10:00:00Z"),score("base",4,"pain_nrs","2026-06-01T10:00:00Z")];
  assert.equal(evaluateRule({kind:"score",instrument_key:"pain_nrs",change_from_prior_gte:3},pain,clock).matched,false);
  assert.equal(evaluateRule({kind:"score",instrument_key:"pain_nrs",change_from_prior_gte:3,compare_to:"baseline"},pain,clock).matched,true);
});
test("Risk rules require both a deadline window and configured shortfall",()=>{
  const rule={kind:"time_budget",value:20,days_left_lte:7,minutes_short_gte:10};
  assert.equal(evaluateRule(rule,[],clock,{minutes:8,deviceDays:0,daysLeft:10}).matched,false);
  assert.equal(evaluateRule(rule,[],clock,{minutes:12,deviceDays:0,daysLeft:6}).matched,false);
  assert.equal(evaluateRule(rule,[],clock,{minutes:8,deviceDays:0,daysLeft:6}).matched,true);
});
test("Rule validation rejects ambiguous aliases and malformed confirmation, notify and resolution-related fields",()=>{
  assert.throws(()=>parseClinicalRule({kind:"threshold",threshold:180,value:190}),/Conflicting/);
  assert.throws(()=>parseClinicalRule({kind:"threshold",value:180,confirm_with_n_readings:0}),/confirm_with/);
  assert.throws(()=>parseClinicalRule({kind:"threshold",op:"outside",low:180,high:120}),/low/);
  assert.throws(()=>parseClinicalRule({kind:"score",item_flag:{index:0,value:0}}),/index/);
  assert.throws(()=>parseClinicalRule({kind:"threshold",value:180,notify:{channels:["fax"]}}),/channels/);
});
