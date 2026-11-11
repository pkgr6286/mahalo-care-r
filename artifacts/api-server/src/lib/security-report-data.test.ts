import {test} from "node:test";
import assert from "node:assert/strict";
import {auditChainStart,auditChainStep,currentSecurityPeriods,practiceDay,validateReportPeriod} from "./security-report-data";
import {documentSourceHash} from "./document-renderer";
import {mayReadSecurityReport} from "./security-reports";
import {scopedRecords} from "./access";
import type {Actor} from "./store";
import type {RecordRow} from "@workspace/db";
test("report calendar uses practice-local dates, not the host/user timezone",()=>{
  const now=new Date("2026-11-11T01:00:00Z");
  assert.equal(practiceDay(now),"2026-11-10");
  assert.deepEqual(currentSecurityPeriods(now),{month:"2026-11",previousMonth:"2026-10",weekStart:"2026-11-09",timeZone:"America/New_York"});
  assert.equal(currentSecurityPeriods(new Date("2026-01-01T14:00:00Z")).previousMonth,"2025-12");
});
test("report inputs reject invalid dates, non-Mondays, future periods and unknown timezones",()=>{
  for(const day of ["2026-11-10","2026-02-30","0000-01-03"])assert.throws(()=>validateReportPeriod("weekly_emergency_access",day,"America/New_York"));
  assert.throws(()=>validateReportPeriod("access_review","2026-13","America/New_York"));
  assert.throws(()=>validateReportPeriod("access_review","2099-01","America/New_York"));
  assert.throws(()=>validateReportPeriod("access_review","2026-01","Not/A_Timezone"));
  validateReportPeriod("weekly_emergency_access","2026-03-02","America/New_York");
});
test("audit event digests are JSONB-order stable but preserve microseconds and content",()=>{
  const a={id:"one",at:"2026-11-10T10:00:00.123456Z",detail:{name:"A",nested:{b:2,a:1}}};
  const b={detail:{nested:{a:1,b:2},name:"A"},at:a.at,id:"one"};
  assert.equal(documentSourceHash(a),documentSourceHash(b));
  assert.notEqual(documentSourceHash(a),documentSourceHash({...a,at:"2026-11-10T10:00:00.123457Z"}));
  assert.notEqual(documentSourceHash(a),documentSourceHash({...a,detail:{name:"B",nested:{b:2,a:1}}}));
});
test("snapshot chains bind period, timezone, event content, count and ordering",()=>{
  const first=documentSourceHash({id:"one"}),second=documentSourceHash({id:"two"}),start=auditChainStart("2026-11","America/New_York");
  const head=auditChainStep(auditChainStep(start,first),second);
  assert.notEqual(head,auditChainStep(auditChainStep(start,second),first));
  assert.notEqual(head,auditChainStep(start,first));
  assert.notEqual(start,auditChainStart("2026-10","America/New_York"));
  assert.notEqual(start,auditChainStart("2026-11","UTC"));
});
test("clinical administrators see only weekly snapshots contained in their current site scope",()=>{
  const actor={id:"one",name:"Test",email:"",role:"clinical_admin",credential:"RN",locationScopes:["Garden City"]} as Actor;
  assert.equal(mayReadSecurityReport(actor,{kind:"weekly_emergency_access",scopeLocations:["Garden City"]}),true);
  assert.equal(mayReadSecurityReport(actor,{kind:"weekly_emergency_access",scopeLocations:[]}),false);
  assert.equal(mayReadSecurityReport(actor,{kind:"weekly_emergency_access",scopeLocations:["Huntington"]}),false);
  assert.equal(mayReadSecurityReport(actor,{kind:"access_review",scopeLocations:["Garden City"]}),false);
  assert.equal(mayReadSecurityReport({...actor,role:"emergency_read_only"},{kind:"weekly_emergency_access",scopeLocations:["Garden City"]}),false);
  assert.equal(mayReadSecurityReport({...actor,role:"admin"},{kind:"audit_integrity",scopeLocations:[]}),true);
});
test("generic record projections never include sealed governance snapshots",()=>{
  const actor={id:"one",name:"Test",email:"",role:"admin",credential:"admin",locationScopes:[]} as Actor;
  const row={id:"report",kind:"security_reports",patientId:null} as RecordRow;
  assert.deepEqual(scopedRecords(actor,[row],[]),[]);
});
