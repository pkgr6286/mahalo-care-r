import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateBilling, intervalsOverlap, type BillingInputs } from "./billing-engine";

const base:BillingInputs={program:"RPM",minutes:20,practitionerMinutes:0,deviceDays:16,liveInteractions:1,consent:true,activePlan:true,setup:true,conditionCount:2,assessment:true,scoreInPeriod:true,cocm:false,initialMonth:true,hasConsultant:true,complexity:false};
const evidence=(overrides:Partial<BillingInputs>,cpt:string)=>evaluateBilling({...base,...overrides}).find(e=>e.cpt===cpt)!;
test("Supply requires a complete, not previously approved window",()=>{
  assert.equal(evidence({supplyWindowComplete:false},"99454").met,false);
  assert.equal(evidence({supplyAlreadyBilled:true},"99454").met,false);
});
test("Setup is blocked after its first approved line",()=>{
  assert.equal(evidence({setupAlreadyBilled:true},"99453").met,false);
});
test("PCM staff and practitioner families cannot both qualify",()=>{
  assert.equal(evidence({program:"PCM",minutes:30,practitionerMinutes:30},"99426").met,true);
  assert.equal(evidence({program:"PCM",minutes:30,practitionerMinutes:30},"99424").met,false);
});
test("Initial CoCM add-on starts above the initial base, not the subsequent base",()=>{
  assert.equal(evidence({program:"BHI",cocm:true,minutes:90,initialMonth:true},"99494").met,false);
  assert.equal(evidence({program:"BHI",cocm:true,minutes:100,initialMonth:true},"99494").units,1);
  assert.equal(evidence({program:"BHI",cocm:true,minutes:90,initialMonth:false},"99494").units,1);
});
test("RPM: supply thresholds are mutually exclusive at every boundary",()=>{
  for(let days=0;days<=31;days++) {
    const short=evidence({deviceDays:days},"99445"),long=evidence({deviceDays:days},"99454");
    assert.equal(short.met,days>=2&&days<=15);
    assert.equal(long.met,days>=16);
    assert.ok(!(short.met&&long.met));
  }
});
test("RPM: exact durations do not round into a threshold",()=>{
  assert.equal(evidence({minutes:9.999},"99470").met,false);
  assert.equal(evidence({minutes:10},"99470").met,true);
  assert.equal(evidence({minutes:19.999},"99457").met,false);
  assert.equal(evidence({minutes:20},"99457").met,true);
});
test("RPM: management tiers never qualify simultaneously",()=>{
  for(let minutes=0;minutes<=100;minutes++) assert.ok(!(evidence({minutes},"99470").met&&evidence({minutes},"99457").met));
});
test("RPM add-on blocks are whole units and capped",()=>{
  for(const [minutes,units] of [[20,0],[39.99,0],[40,1],[59.99,1],[60,2],[100,2]]) assert.equal(evidence({minutes},"99458").units,units);
});
test("All programs require consent and an active plan",()=>{
  for(const program of ["RPM","RTM","CCM","PCM","BHI"]) {
    assert.ok(evaluateBilling({...base,program,consent:false}).every(e=>!e.met));
    assert.ok(evaluateBilling({...base,program,activePlan:false}).every(e=>!e.met));
  }
});
test("RPM and RTM messages alone cannot satisfy live interaction",()=>{
  for(const [program,code] of [["RPM","99457"],["RTM","98980"]]) assert.equal(evidence({program,liveInteractions:0},code!).met,false);
});
test("RTM supply and management boundaries",()=>{
  assert.equal(evidence({program:"RTM",deviceDays:15},"98985").met,true);
  assert.equal(evidence({program:"RTM",deviceDays:15},"98977").met,false);
  assert.equal(evidence({program:"RTM",minutes:10},"98979").met,true);
  assert.equal(evidence({program:"RTM",minutes:20},"98980").met,true);
});
test("Respiratory RTM uses distinct mutually exclusive supply codes",()=>{
  const short=evaluateBilling({...base,program:"RTM",rtmVariant:"respiratory",deviceDays:15});
  assert.equal(short.find(e=>e.cpt==="98984")?.met,true);
  assert.equal(short.find(e=>e.cpt==="98976")?.met,false);
  assert.ok(!short.some(e=>["98985","98977"].includes(e.cpt)));
  assert.equal(evaluateBilling({...base,program:"RTM",rtmVariant:"respiratory",deviceDays:16}).find(e=>e.cpt==="98976")?.met,true);
});
test("CCM requires two conditions",()=>{
  assert.equal(evidence({program:"CCM",conditionCount:1},"99490").met,false);
  assert.equal(evidence({program:"CCM",conditionCount:2},"99490").met,true);
});
test("CCM cannot select staff and practitioner base families together",()=>{
  assert.equal(evidence({program:"CCM",minutes:20,practitionerMinutes:30},"99490").met,true);
  assert.equal(evidence({program:"CCM",minutes:20,practitionerMinutes:30},"99491").met,false);
});
test("Complex CCM switches away from simple staff family",()=>{
  assert.equal(evidence({program:"CCM",minutes:60,complexity:true},"99487").met,true);
  assert.equal(evidence({program:"CCM",minutes:60,complexity:true},"99490").met,false);
});
test("PCM uses distinct practitioner and staff durations",()=>{
  assert.equal(evidence({program:"PCM",minutes:29,practitionerMinutes:30},"99424").met,true);
  assert.equal(evidence({program:"PCM",minutes:29,practitionerMinutes:30},"99426").met,false);
});
test("BHI requires current scale and assessment",()=>{
  assert.equal(evidence({program:"BHI",assessment:false},"99484").met,false);
  assert.equal(evidence({program:"BHI",scoreInPeriod:false},"99484").met,false);
  assert.equal(evidence({program:"BHI"},"99484").met,true);
});
test("CoCM distinguishes first and subsequent month",()=>{
  const input={program:"BHI",cocm:true,minutes:70,hasConsultant:true};
  assert.equal(evidence({...input,initialMonth:true},"99492").met,true);
  assert.equal(evidence({...input,initialMonth:true},"99493").met,false);
  assert.equal(evidence({...input,initialMonth:false},"99493").met,true);
  assert.equal(evidence({...input,initialMonth:false},"99492").met,false);
});
test("CoCM cannot qualify without consultant",()=>{
  assert.equal(evidence({program:"BHI",cocm:true,minutes:70,hasConsultant:false},"99492").met,false);
});
test("Adjacent time intervals do not overlap",()=>{
  assert.equal(intervalsOverlap("2026-01-01T10:00:00Z","2026-01-01T10:20:00Z","2026-01-01T10:20:00Z","2026-01-01T10:40:00Z"),false);
});
test("Contained and partial time intervals overlap",()=>{
  assert.equal(intervalsOverlap("2026-01-01T10:00:00Z","2026-01-01T10:30:00Z","2026-01-01T10:10:00Z","2026-01-01T10:20:00Z"),true);
  assert.equal(intervalsOverlap("2026-01-01T10:00:00Z","2026-01-01T10:30:00Z","2026-01-01T10:20:00Z","2026-01-01T10:40:00Z"),true);
});
