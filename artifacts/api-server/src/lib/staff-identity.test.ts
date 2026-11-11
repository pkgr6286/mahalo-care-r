import test from "node:test";
import assert from "node:assert/strict";
import {checkedNpi,staffContext,validateSiteRoles} from "./staff-identity";

test("site roles resolve one location without combining other-site privileges",()=>{
  const u={role:"care_manager",locationScopes:[],siteRoles:{"Garden City":"billing_provider","Hicksville":"front_desk"}};
  assert.deepEqual(staffContext(u,"Hicksville"),{role:"front_desk",locationScopes:["Hicksville"],activeLocation:"Hicksville"});
  assert.equal(staffContext(u,"Unassigned").activeLocation,"Garden City");
  assert.deepEqual(staffContext({...u,siteRoles:{},locationScopes:["Garden City"]}),{role:"care_manager",locationScopes:["Garden City"],activeLocation:null});
});
test("site assignments cannot grant practice administration or portal identities",()=>{
  assert.throws(()=>validateSiteRoles("care_manager",{"Garden City":"admin"}));
  assert.throws(()=>validateSiteRoles("patient",{"Garden City":"care_manager"}));
  assert.throws(()=>validateSiteRoles("caregiver",{"Garden City":"read_only"}));
  assert.throws(()=>validateSiteRoles("admin",{"Garden City":"clinical_admin"}));
});
test("NPI formatting and CMS-prefix Luhn checksum are enforced without claiming licensure",()=>{
  assert.equal(checkedNpi(null),null);assert.equal(checkedNpi(""),null);
  assert.equal(checkedNpi("1234567893"),"1234567893");
  assert.throws(()=>checkedNpi("1234567890"),/check digit/);assert.throws(()=>checkedNpi("12345"),/10-digit/);
});
