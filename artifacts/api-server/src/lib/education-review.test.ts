import test from "node:test";
import assert from "node:assert/strict";
import type {RecordRow} from "@workspace/db";
import type {Actor} from "./store";
import {educationBody,educationReviewHash,educationAvailable,instrumentAvailable,reviewedContentMetadata} from "./content-review";
const actor={id:"reviewer",name:"Synthetic reviewer",role:"admin"} as Actor;
const input={title:"Synthetic guide",description:"Original summary",program:null,metadata:{body:"Original displayed text",contentVersion:"1",sourceRef:"Self-authored synthetic source",licenseNote:"Original material used only for this synthetic verification.",contentApprovedForUse:true}};
const approved=()=>reviewedContentMetadata("education",input,actor)!;
const record=()=>({...input,id:"example",kind:"education",status:"active",metadata:approved()}) as RecordRow;
test("education fingerprints cover displayed body aliases and distinguish the licensing review from the reading hash",()=>{
  assert.equal(educationBody({body:"",content:"Fallback",text:"Last"}),"Fallback");
  assert.notEqual(educationReviewHash(input),educationReviewHash({...input,metadata:{...input.metadata,body:"Changed text"}}));
  const alias={...input,metadata:{...input.metadata,body:null,content:input.metadata.body}};
  assert.equal(educationReviewHash(input),educationReviewHash(alias));
});
test("learning approval uses the authenticated reviewer and the exact education fingerprint",()=>{
  const m=reviewedContentMetadata("education",{...input,metadata:{...input.metadata,contentReviewedById:"forged"}},actor)!;
  assert.equal(m.contentReviewedById,actor.id);assert.equal(m.contentReviewHash,educationReviewHash({...input,metadata:m}));
  assert.equal(educationAvailable({...input,status:"active",metadata:m}),true);
});
test("all displayed content and licensing changes revoke education review",()=>{
  const old=record();
  for(const change of [{title:"New title"},{description:"New summary"},{program:"RPM"},{metadata:{body:"New text"}},{metadata:{contentVersion:"2"}},
    {metadata:{sourceRef:"New source"}},{metadata:{licenseNote:"A different permission and license note."}},{metadata:{url:"https://example.test/new"}},
    {metadata:{type:"new_type"}},{metadata:{nonClinical:true}}]) {
    const m=reviewedContentMetadata("education",change,actor,old)!;
    assert.equal(m.contentApprovedForUse,false);assert.equal(m.contentReviewHash,null);
  }
});
test("saving or activating unchanged content cannot silently replace its original reviewer",()=>{
  const old=record(),other={...actor,id:"other-reviewer",name:"Another reviewer"};
  const m=reviewedContentMetadata("education",{metadata:{contentApprovedForUse:true}},other,old)!;
  assert.equal(m.contentReviewedById,actor.id);assert.equal(m.contentReviewedAt,old.metadata.contentReviewedAt);
});
test("patients receive only active readable application instructions or exact reviewed clinical text",()=>{
  const r=record();assert.equal(educationAvailable(r),true);
  assert.equal(educationAvailable({...r,status:"draft"}),false);
  assert.equal(educationAvailable({...r,metadata:{...r.metadata,body:"Changed after review"}}),false);
  assert.equal(educationAvailable({...r,metadata:{body:"Original app instructions",nonClinical:true}}),true);
  assert.equal(educationAvailable({...r,metadata:{url:"https://example.test/guide",nonClinical:true}}),true);
  for(const url of ["javascript:alert(1)","http://example.test","https://user:pass@example.test/guide"])assert.equal(educationAvailable({...r,metadata:{url,nonClinical:true}}),false);
  assert.equal(educationAvailable({...r,metadata:{...r.metadata,body:"",url:"https://example.test/clinical"}}),false);
});
test("unreviewed instrument wording is withheld while explicit synthetic placeholders remain available",()=>{
  const r={title:"Synthetic instrument",status:"active",metadata:{key:"pain_nrs",questions:["Synthetic wording"],sourceRef:"Original test",licenseNote:"Permission is limited to this synthetic test.",contentApprovedForUse:true}};
  assert.equal(instrumentAvailable(r),false);
  const m=reviewedContentMetadata("instruments",r,actor)!;assert.equal(instrumentAvailable({...r,metadata:m}),true);
  assert.equal(instrumentAvailable({...r,status:"inactive",metadata:m}),false);
  assert.equal(instrumentAvailable({...r,metadata:{questions:[]}}),true);
  assert.equal(instrumentAvailable({...r,metadata:{questions:{bad:"shape"}}}),false);
});
