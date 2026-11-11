import test from "node:test";
import assert from "node:assert/strict";
import {quietHoursSchema,withinQuietHours,nextAllowedNotificationAt} from "./communication-preferences";
const quiet={enabled:true,start:"22:00",end:"08:00"};
test("quiet periods include their start and exclude their end in the patient's timezone",()=>{
  assert.equal(withinQuietHours(new Date("2026-11-11T22:00:00Z"),"UTC",quiet),true);
  assert.equal(withinQuietHours(new Date("2026-11-12T08:00:00Z"),"UTC",quiet),false);
  assert.equal(withinQuietHours(new Date("2026-11-11T22:00:00Z"),"America/New_York",quiet),false);
});
test("overnight notifications resume at the first allowed actual minute",()=>{
  assert.equal(nextAllowedNotificationAt(new Date("2026-11-11T23:14:45Z"),"UTC",quiet).toISOString(),"2026-11-12T08:00:00.000Z");
  const day={enabled:true,start:"09:00",end:"17:00"};
  assert.equal(nextAllowedNotificationAt(new Date("2026-11-11T16:59:45Z"),"UTC",day).toISOString(),"2026-11-11T17:00:00.000Z");
});
test("spring-forward skipped end times release at the first real instant outside quiet hours",()=>{
  assert.equal(nextAllowedNotificationAt(new Date("2026-03-08T06:50:00Z"),"America/New_York",{enabled:true,start:"22:00",end:"02:30"}).toISOString(),"2026-03-08T07:00:00.000Z");
});
test("fall-back repeated clock hours are resolved by their actual instants",()=>{
  const q={enabled:true,start:"22:00",end:"01:30"};
  assert.equal(nextAllowedNotificationAt(new Date("2026-11-01T05:20:00Z"),"America/New_York",q).toISOString(),"2026-11-01T05:30:00.000Z");
  assert.equal(nextAllowedNotificationAt(new Date("2026-11-01T06:10:00Z"),"America/New_York",q).toISOString(),"2026-11-01T06:30:00.000Z");
});
test("disabled or absent quiet preferences never delay contact",()=>{
  const at=new Date("2026-11-11T23:14:45Z");
  assert.equal(nextAllowedNotificationAt(at,"UTC"),at);
  assert.equal(nextAllowedNotificationAt(at,"UTC",{...quiet,enabled:false}),at);
});
test("ambiguous all-day, malformed clocks and invalid enabled timezones fail explicitly",()=>{
  for(const q of [{...quiet,start:"08:00"},{...quiet,start:"24:00"},{...quiet,end:"8:00"}])assert.equal(quietHoursSchema.safeParse(q).success,false);
  assert.throws(()=>withinQuietHours(new Date(),"Not/A_Timezone",quiet));
  assert.throws(()=>withinQuietHours(new Date("bad"),"UTC",quiet));
});
