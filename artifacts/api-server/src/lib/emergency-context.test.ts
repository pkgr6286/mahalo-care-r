import test from "node:test";
import assert from "node:assert/strict";
import type {PatientRow,RecordRow} from "@workspace/db";
import {applyEmergencyContext} from "./emergency-context";
import {canUseEmergencyAccess} from "./staff-identity";
import {hasPermission,scopedPatients,scopedRecords} from "./access";
import type {Actor} from "./store";

const clock=Date.parse("2026-11-11T12:00:00.000Z");
const normal:Actor={id:"nurse",name:"Fictional nurse",email:"nurse@example.test",role:"care_manager",credential:"RN",locationScopes:["Garden City"],canUseEmergencyAccess:true};
const context={patientId:"target",patientName:"Fictional patient",mrn:"TEST-1",location:"Huntington",reason:"Urgent review requested by the covering clinical team.",startedAt:new Date(clock).toISOString(),expiresAt:new Date(clock+4*60*60*1000).toISOString()};
test("emergency eligibility requires a scoped clinical assignment and professional credential",()=>{
  assert.equal(canUseEmergencyAccess(normal),true);
  assert.equal(canUseEmergencyAccess({...normal,role:"front_desk"}),false);
  assert.equal(canUseEmergencyAccess({...normal,credential:"MA"}),false);
  assert.equal(canUseEmergencyAccess({...normal,locationScopes:[]}),false);
  assert.equal(canUseEmergencyAccess({...normal,siteRoles:{"Garden City":"front_desk"}}),false);
  assert.equal(canUseEmergencyAccess({...normal,role:"admin"}),false);
});
test("emergency context grants only patient/clinical reads and never combines normal permissions",()=>{
  const emergency=applyEmergencyContext(normal,context,clock);
  assert.equal(emergency.id,normal.id);assert.equal(emergency.credential,"RN");
  assert.equal(emergency.role,"emergency_read_only");
  assert.equal(hasPermission(emergency,"clinical.read"),true);
  for(const p of ["clinical.write","patients.write","plans.sign","notes.sign","billing.read","audit.read","messages.write","time.write","admin"])assert.equal(hasPermission(emergency,p),false);
});
test("emergency patient scope excludes both other patients at the target site and the normal site",()=>{
  const emergency=applyEmergencyContext(normal,context,clock);
  const ps=[{id:"target",location:"Huntington",dataset:"clinical"},{id:"same-site",location:"Huntington",dataset:"clinical"},{id:"own-site",location:"Garden City",dataset:"clinical"}] as PatientRow[];
  assert.deepEqual(scopedPatients(emergency,ps).map(p=>p.id),["target"]);
  const rs=ps.map(p=>({id:p.id,kind:"notes",patientId:p.id})) as RecordRow[];
  assert.deepEqual(scopedRecords(emergency,rs,ps).map(r=>r.id),["target"]);
  assert.deepEqual(scopedPatients(emergency,[{...ps[0]!,location:"Garden City"}]).map(p=>p.id),["target"]);
});
test("expiry, future starts, malformed data and overlong grants cannot activate emergency permissions",()=>{
  for(const ctx of [
    {...context,expiresAt:new Date(clock).toISOString()},
    {...context,expiresAt:new Date(clock+5*60*60*1000).toISOString()},
    {...context,startedAt:new Date(clock+1000).toISOString()},
    {...context,reason:"short"},
    null,
  ]){
    const actor=applyEmergencyContext(normal,ctx,clock);assert.equal(actor.role,normal.role);assert.equal(actor.emergencyContext,null);
  }
  assert.equal(applyEmergencyContext({...normal,canUseEmergencyAccess:false},context,clock).role,"care_manager");
});
