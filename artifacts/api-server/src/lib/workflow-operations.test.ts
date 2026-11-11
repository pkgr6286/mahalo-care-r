import test from "node:test";
import assert from "node:assert/strict";
import {type RecordRow} from "@workspace/db";
import {uncommittedReminderDue} from "./time-reminders";
import {educationHash} from "./education";
import {reviewedContentMetadata,instrumentContentHash} from "./content-review";
import {configurationHash} from "./configuration";
const clock=Date.parse("2026-11-11T12:00:00Z");
const row=(extra:Partial<RecordRow>={})=>({id:"example",kind:"time",title:"Example",description:"Example",program:null,status:"running",metadata:{startedAt:"2026-11-11T11:40:00Z"},updatedAt:new Date(clock),...extra}) as RecordRow;
test("uncommitted reminders are due only for old running/draft entries, never committed time",()=>{
  assert.equal(uncommittedReminderDue(row(),clock),true);
  for(const status of ["committed","voided","completed"])assert.equal(uncommittedReminderDue(row({status}),clock),false);
  assert.equal(uncommittedReminderDue(row({metadata:{startedAt:"2026-11-11T11:50:00Z"}}),clock),false);
  assert.equal(uncommittedReminderDue(row({metadata:{startedAt:"not a timestamp"}}),clock),false);
  assert.equal(uncommittedReminderDue(row({status:"draft",metadata:{endedAt:"2026-11-11T11:44:59Z"}}),clock),true);
});
test("learning acknowledgment hashes cover displayed text, version, source and body",()=>{
  const material=row({kind:"education",metadata:{body:"Displayed body",contentVersion:"1",url:"https://example.test/guide"}});
  assert.equal(educationHash(material),educationHash(structuredClone(material)));
  for(const metadata of [{...material.metadata,body:"Changed body"},{...material.metadata,contentVersion:"2"},{...material.metadata,url:"https://example.test/new"}])assert.notEqual(educationHash({...material,metadata}),educationHash(material));
});
test("content review records the real actor and is invalidated on editing or revocation",()=>{
  const actor={id:"reviewer",name:"Synthetic reviewer",role:"admin",email:"test@example.test",credential:"RN"};
  const input={title:"Synthetic question",metadata:{key:"pain_nrs",questions:["Synthetic item"],contentVersion:"1",sourceRef:"Self-authored example",licenseNote:"Self-authored synthetic use, reviewed only for this test.",contentApprovedForUse:true,contentReviewedById:"forged"}};
  const approved=reviewedContentMetadata("instruments",input,actor)!;
  assert.equal(approved.contentReviewedById,actor.id);assert.equal(approved.contentReviewHash,instrumentContentHash({...input,metadata:approved}));
  const old=row({kind:"instruments",title:input.title,description:"",metadata:approved});
  assert.equal(reviewedContentMetadata("instruments",{metadata:{questions:["Changed item"]}},actor,old)!.contentApprovedForUse,false);
  assert.equal(reviewedContentMetadata("instruments",{metadata:{contentApprovedForUse:false}},actor,old)!.contentReviewHash,null);
  assert.throws(()=>reviewedContentMetadata("instruments",{...input,metadata:{...input.metadata,licenseNote:"short"}},actor));
});
test("configuration hashes are stable across object key order and reject excessive nesting",()=>{
  assert.equal(configurationHash({a:1,b:{x:2,y:3}}),configurationHash({b:{y:3,x:2},a:1}));
  assert.notEqual(configurationHash({a:[1,2]}),configurationHash({a:[2,1]}));
  let nested:unknown={};for(let i=0;i<45;i++)nested={child:nested};
  assert.throws(()=>configurationHash(nested));
});
