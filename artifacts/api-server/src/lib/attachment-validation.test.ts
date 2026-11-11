import test from "node:test";
import assert from "node:assert/strict";
import {ATTACHMENT_LIMIT,validateAttachmentFilename,validateSupportingPdf,validateIncomingAttachmentMetadata} from "./attachment-validation";
const pdf=Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
test("untrusted incoming content encoding is rejected before any automatic decompression",()=>{
  assert.throws(()=>validateIncomingAttachmentMetadata("100","gzip",100));
  assert.throws(()=>validateIncomingAttachmentMetadata("100","br",100));
  assert.doesNotThrow(()=>validateIncomingAttachmentMetadata("100",undefined,100));
});
test("incoming cloud size metadata must be a finite permitted integer matching the ticket",()=>{
  for(const size of [undefined,"bad",0,-1,100.5,ATTACHMENT_LIMIT+1])assert.throws(()=>validateIncomingAttachmentMetadata(size,undefined,100));
});
test("supporting PDF filenames cannot contain paths, controls or misleading extensions",()=>{
  assert.equal(validateAttachmentFilename("Synthetic supporting file.pdf"),"Synthetic supporting file.pdf");
  for(const s of ["../file.pdf","C:\\file.pdf","bad\nname.pdf","bad\u202ename.pdf","file.pdf.exe"," file.pdf","a".repeat(121)+".pdf"])assert.throws(()=>validateAttachmentFilename(s));
});
test("supporting PDF format checks hash exact bytes but do not claim malware scanning",()=>{
  assert.match(validateSupportingPdf(pdf,pdf.length),/^[a-f0-9]{64}$/);
  assert.notEqual(validateSupportingPdf(pdf,pdf.length),validateSupportingPdf(Buffer.concat([pdf.subarray(0,-6),Buffer.from("\n%%EOF")]),pdf.length));
});
test("supporting PDF size mismatches and oversized or empty uploads fail",()=>{
  assert.throws(()=>validateSupportingPdf(pdf,pdf.length+1));
  assert.throws(()=>validateSupportingPdf(Buffer.alloc(0),0));
  assert.throws(()=>validateSupportingPdf(Buffer.alloc(ATTACHMENT_LIMIT+1),ATTACHMENT_LIMIT+1));
});
test("supporting PDFs must have actual header and EOF markers",()=>{
  assert.throws(()=>validateSupportingPdf(Buffer.from("pretend PDF"),11));
  assert.throws(()=>validateSupportingPdf(pdf.subarray(0,-8),pdf.length-8));
});
test("known active, embedded and encrypted PDF directives are rejected before quarantine release",()=>{
  for(const key of ["JavaScript","JS","Launch","RichMedia","EmbeddedFile","Encrypt","OpenAction","AA"]){
    const b=Buffer.from(`%PDF-1.4\n/${key} true\n%%EOF`);
    assert.throws(()=>validateSupportingPdf(b,b.length));
  }
});
