import {test} from "node:test";
import assert from "node:assert/strict";
import {bundledRulepack} from "./default-rulepacks";
import {evaluateBilling,type BillingInputs} from "./billing-engine";
import {RulepackSchema,PayerOverrideSchema,tightenRulepack,visitWithinCalendarMonths} from "./program-policy-schema";

const input:BillingInputs={program:"RPM",minutes:40,practitionerMinutes:60,deviceDays:16,liveInteractions:1,consent:true,consentTypes:["program","device_sharing"],eligibleDevice:true,instrumentsInPeriod:["phq9"],activePlan:true,setup:true,conditionCount:2,assessment:true,scoreInPeriod:true,cocm:false,initialMonth:true,hasConsultant:true,complexity:false,supplyWindowComplete:true};
test("Bundled JSON policies preserve existing decisions across all five programs and boundary scenarios",()=>{
  let scenarios=0;
  for(const program of ["RPM","RTM","CCM","PCM","BHI"]) for(const minutes of [0,10,19.9,20,39.9,40,60,69.9,70,100]) for(const deviceDays of [0,1,2,15,16,30]) for(const cocm of [false,true]) for(const initialMonth of [false,true]) {
    const facts={...input,program,minutes,deviceDays,cocm,initialMonth};
    const decisions=(results:ReturnType<typeof evaluateBilling>)=>results.map(({cpt,met,units})=>({cpt,met,units})).sort((a,b)=>a.cpt.localeCompare(b.cpt));
    assert.deepEqual(decisions(evaluateBilling(facts,bundledRulepack(program))),decisions(evaluateBilling(facts)),`${program}/${minutes}/${deviceDays}/${cocm}/${initialMonth}`);scenarios++;
  }
  assert.equal(scenarios,1200);
});
test("Payer policies can only tighten existing codes and cannot expand units",()=>{
  const pack=bundledRulepack("RPM");
  const stricter=tightenRulepack(pack,PayerOverrideSchema.parse({basePolicyId:"demo",codes:[{cpt:"99457",minutes_min:30,live_interactive_min:2},{cpt:"99458",max_units:1}]}));
  assert.equal(evaluateBilling({...input,minutes:25},stricter).find(c=>c.cpt==="99457")?.met,false);
  assert.throws(()=>tightenRulepack(pack,{basePolicyId:"demo",codes:[{cpt:"99457",minutes_min:10}]}),/cannot lower/);
  assert.throws(()=>tightenRulepack(pack,{basePolicyId:"demo",codes:[{cpt:"99458",max_units:3}]}),/cannot increase/);
  assert.throws(()=>tightenRulepack(pack,{basePolicyId:"demo",codes:[{cpt:"99999",minutes_min:10}]}),/cannot add/);
  assert.throws(()=>tightenRulepack(pack,{basePolicyId:"demo",codes:[{cpt:"99454",device_days_min:2}]}),/cannot lower/);
  const disabled=tightenRulepack(pack,{basePolicyId:"demo",codes:[{cpt:"99457",disabled:true}]});
  assert.equal(evaluateBilling(input,disabled).find(c=>c.cpt==="99458")?.met,false);
});
test("Policy grammar rejects rounding, broken parent references and inverted requirements",()=>{
  const base=bundledRulepack("RPM");
  assert.equal(RulepackSchema.safeParse({...base,time_rules:{...base.time_rules,rounding:"ceil"}}).success,false);
  assert.equal(RulepackSchema.safeParse({...base,codes:base.codes.map(c=>c.cpt==="99458"?{...c,parent:"99999"}:c)}).success,false);
  assert.equal(RulepackSchema.safeParse({...base,codes:base.codes.map(c=>c.cpt==="99445"?{...c,requires:{device_days_min:16,device_days_max:15}}:c)}).success,false);
});
test("Initiating-visit windows use real calendar months, including leap and short months",()=>{
  assert.equal(visitWithinCalendarMonths("2024-02-29","2024-03-31",1),true);
  assert.equal(visitWithinCalendarMonths("2024-02-28","2024-03-31",1),false);
  assert.equal(visitWithinCalendarMonths("2025-02-28","2025-03-31",1),true);
  assert.equal(visitWithinCalendarMonths("2025-03-32","2025-04-30",1),false);
  assert.equal(visitWithinCalendarMonths("2025-05-01","2025-04-30",1),false);
});
