import {test} from "node:test";
import assert from "node:assert/strict";
import {permissionsFor,hasPermission,inLocation,scopedPatients,scopedRecords} from "./access";
import type {Actor} from "./store";
import type {PatientRow,RecordRow} from "@workspace/db";

const actor:Actor={id:"x",name:"Test",email:"test@example.test",role:"care_manager",credential:"RN",locationScopes:["North"]};
test("role permissions deny unknown identities and enforce separation of duties",()=>{
  assert.deepEqual(permissionsFor("unrecognized"),[]);
  assert.equal(hasPermission(actor,"clinical.write"),true);
  assert.equal(hasPermission(actor,"billing.write"),false);
  assert.equal(hasPermission({...actor,role:"billing"},"clinical.write"),false);
  assert.equal(hasPermission({...actor,role:"read_only"},"clinical.write"),false);
  assert.equal(hasPermission({...actor,role:"front_desk"},"clinical.read"),false);
  assert.equal(hasPermission({...actor,role:"patient"},"admin"),false);
});
test("location scopes filter patient and clinical lists but admin sees all sites",()=>{
  const ps=[{id:"n",location:"North"},{id:"s",location:"South"}] as PatientRow[];
  assert.deepEqual(scopedPatients(actor,ps).map(p=>p.id),["n"]);
  assert.equal(inLocation({...actor,role:"admin"},"South"),true);
  assert.deepEqual(scopedPatients({...actor,role:"patient",patientId:"s"},ps).map(p=>p.id),["s"]);
  const rs=[{id:"n",patientId:"n",kind:"notes"},{id:"s",patientId:"s",kind:"notes"},{id:"l",kind:"locations",title:"South",patientId:null},{id:"c",kind:"programs",patientId:null}] as RecordRow[];
  assert.deepEqual(scopedRecords(actor,rs,ps).map(r=>r.id),["n","c"]);
});
