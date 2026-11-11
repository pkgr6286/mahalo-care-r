import assert from "node:assert/strict";
import "./validation-fetch";
import {randomUUID,createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {spawnSync} from "node:child_process";
import PDFDocument from "pdfkit";
import {db,pool,attachments} from "@workspace/db";
import {eq} from "drizzle-orm";
let passed=0,pid="";
type TestClient={request(path:string,body?:unknown,expected?:number,method?:string):Promise<any>};
const clients:TestClient[]=[];
function client():TestClient{let cookie="";const c={async request(path:string,body?:unknown,expected=200,method=body===undefined?"GET":"POST"){
  const r=await fetch("http://localhost:80/api"+path,{method,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  if(r.headers.getSetCookie().some(s=>s.startsWith("mahalo_session=")))cookie=r.headers.getSetCookie().map(s=>s.split(";")[0]).join("; ");
  assert.equal(r.status,expected,`${method} ${path}: unexpected status`);passed++;
   if(["application/pdf","application/zip"].some(t=>r.headers.get("content-type")?.startsWith(t)))return Buffer.from(await r.arrayBuffer());
  return r.json();
}};clients.push(c);return c;}
async function pdf(text:string){return new Promise<Buffer>(resolve=>{const d=new PDFDocument();const chunks:Buffer[]=[];d.on("data",b=>chunks.push(b));d.on("end",()=>resolve(Buffer.concat(chunks)));d.text(text);d.end();});}
async function put(url:string,bytes:Buffer){const r=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/pdf"},body:new Uint8Array(bytes),signal:AbortSignal.timeout(60000)});assert.equal(r.status,200,"Direct private upload failed");passed++;}
function verifyBundle(bytes:Buffer,attachmentId:string,hash:string){
  const result=spawnSync("python3",["-c",`import sys,io,zipfile,json,hashlib
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
m=json.loads(z.read("manifest.json"));r=json.loads(z.read("patient-record.json"))
for f in m["files"]:
 assert hashlib.sha256(z.read(f["name"])).hexdigest()==f["sha256"]
f=next(f for f in m["files"] if f.get("attachmentId")==sys.argv[1])
assert f["sha256"]==sys.argv[2] and f["name"].startswith("supporting-files/")
a=next(a for a in r["supportingFiles"] if a["id"]==sys.argv[1])
assert a["includedInArchive"] and "objectPath" not in a and "generation" not in a
`,attachmentId,hash],{input:bytes,encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
}
async function main(){
  const admin=client(),patient=client(),cm=client(),readonly=client(),front=client(),anon=client();
  try{
    for(const [c,email]of [[admin,"demo"],[patient,"patient"],[cm,"caremanager"],[readonly,"readonly"],[front,"frontdesk"]]as const)await c.request("/auth/login",{email:`${email}@mahalo.care`,password:"MahaloDemo2026!"});
    const ownId=(await patient.request("/auth/me")).patientId as string;assert.ok(ownId);
    pid=(await admin.request("/patients",{firstName:"Synthetic",lastName:`File QA ${randomUUID().slice(0,6)}`,dob:"1980-01-01",location:"Garden City"},201)).id;
    assert.equal((await admin.request(`/patients/${pid}`)).patient.lastContact,"","Patient creation must not invent contact");
    const base=`/patients/${pid}/attachments`,bytes=await pdf("Synthetic supporting PDF acceptance fixture. No real patient information."),hash=createHash("sha256").update(bytes).digest("hex");
    const upload={uploadId:randomUUID(),filename:"Synthetic supporting file.pdf",sizeBytes:bytes.length,mimeType:"application/pdf"};
    await anon.request(base,undefined,401);await patient.request(base,undefined,403);await front.request(base,undefined,403);
    await readonly.request(`${base}/uploads`,upload,403);
    await admin.request(`${base}/uploads`,{...upload,filename:"../path.pdf"},400);
    await admin.request(`${base}/uploads`,{...upload,sizeBytes:1048577},400);
    await admin.request(`${base}/uploads`,{...upload,mimeType:"text/html"},400);
    await admin.request(`${base}/uploads`,{...upload,uploadId:"not-a-uuid"},400);
    await admin.request(`${base}/uploads`,{...upload,uploadedById:"forged"},400);
    const ticket=await admin.request(`${base}/uploads`,upload);assert.equal(ticket.attachmentId,upload.uploadId);assert.ok(ticket.uploadURL);
    let list=await admin.request(base);let row=list.find((r:any)=>r.id===ticket.attachmentId);assert.equal(row.status,"awaiting_upload");
    const url=`${base}/${row.id}`,reason="Known synthetic supporting file used only for local demonstration.";
    await admin.request(`${url}/download`,undefined,403);
    await admin.request(`${url}/complete`,{},503);
    await admin.request(`${url}/review`,{decision:"release_demo",reason,expectedUpdatedAt:row.updatedAt,syntheticSourceConfirmed:true,unscannedRiskAcknowledged:true},409);
    const repeated=await admin.request(`${base}/uploads`,upload);assert.equal(repeated.attachmentId,ticket.attachmentId);
    await put(repeated.uploadURL,bytes);
    row=await admin.request(`${url}/complete`,{});assert.equal(row.status,"quarantined");assert.equal(row.sha256,hash);assert.equal(row.canDownload,false);
    const completedAgain=await admin.request(`${url}/complete`,{});assert.equal(completedAgain.updatedAt,row.updatedAt);
    await cm.request(`${url}/complete`,{},403);
    await put(repeated.uploadURL,await pdf("A replacement incoming PDF must not replace the already sealed original."));
    await admin.request(`${url}/download`,undefined,403);
    const review={decision:"release_demo",reason,expectedUpdatedAt:row.updatedAt,syntheticSourceConfirmed:true,unscannedRiskAcknowledged:true};
    await cm.request(`${url}/review`,review,403);
    await admin.request(`${url}/review`,{...review,unscannedRiskAcknowledged:false},400);
    await admin.request(`${url}/review`,{...review,expectedUpdatedAt:"1970-01-01T00:00:00.000Z"},409);
    await admin.request(`${url}/review`,{...review,reviewedBy:"forged"},400);
    row=await admin.request(`${url}/review`,review);assert.equal(row.status,"released_demo");assert.equal(row.reviewedBy,"Sarah Mitchell");
    const downloaded=await admin.request(`${url}/download`);assert.equal(createHash("sha256").update(downloaded).digest("hex"),hash,"Incoming PUT must never replace sealed download bytes");
    assert.equal((await readonly.request(`${url}/download`)).subarray(0,5).toString(),"%PDF-");
    verifyBundle(await admin.request(`/patients/${pid}/access-export`),row.id,hash);
    await patient.request(`${url}/download`,undefined,403);
    await assert.rejects(db.transaction(async s=>{await s.update(attachments).set({sha256:"0".repeat(64)}).where(eq(attachments.id,row.id));}));
    await assert.rejects(db.transaction(async s=>{await s.delete(attachments).where(eq(attachments.id,row.id));}));
    row=await admin.request(`${url}/review`,{decision:"revoke",reason,expectedUpdatedAt:row.updatedAt});assert.equal(row.status,"revoked");
    await admin.request(`${url}/download`,undefined,403);await admin.request(`${url}/review`,{...review,expectedUpdatedAt:row.updatedAt},409);
    const selfBase=`/patients/${ownId}/attachments`,selfTicket=await patient.request(`${selfBase}/uploads`,{...upload,uploadId:randomUUID(),filename:"Synthetic patient upload.pdf"});
    await put(selfTicket.uploadURL,bytes);let self=await patient.request(`${selfBase}/${selfTicket.attachmentId}/complete`,{});assert.equal(self.canCancel,true);assert.equal(self.canReview,false);
    await patient.request(`${selfBase}/${self.id}/review`,{...review,expectedUpdatedAt:self.updatedAt},403);
    await patient.request(`${selfBase}/${row.id}/download`,undefined,404);
    self=await patient.request(`${selfBase}/${self.id}/review`,{decision:"cancel",reason,expectedUpdatedAt:self.updatedAt});assert.equal(self.status,"canceled");
    await patient.request(`${selfBase}/${self.id}/download`,undefined,403);
    const bad=Buffer.from("not a PDF"),badInput={...upload,uploadId:randomUUID(),sizeBytes:bad.length,filename:"Invalid synthetic file.pdf"};
    const badTicket=await admin.request(`${base}/uploads`,badInput);await put(badTicket.uploadURL,bad);
    await admin.request(`${base}/${badTicket.attachmentId}/complete`,{},422);
    const invalid=(await admin.request(base)).find((r:any)=>r.id===badTicket.attachmentId);assert.equal(invalid.status,"rejected");assert.ok(invalid.validationError);assert.equal(invalid.canDownload,false);
    await admin.request(`${base}/uploads`,badInput,409);
    const encoded=gzipSync(bytes),encodedTicket=await admin.request(`${base}/uploads`,{...upload,uploadId:randomUUID(),sizeBytes:encoded.length,filename:"Encoded synthetic upload.pdf"});
    const encodedPut=await fetch(encodedTicket.uploadURL,{method:"PUT",headers:{"Content-Type":"application/pdf","Content-Encoding":"gzip"},body:new Uint8Array(encoded),signal:AbortSignal.timeout(60000)});
    assert.equal(encodedPut.status,200,"Encoded private fixture upload failed");passed++;
    await admin.request(`${base}/${encodedTicket.attachmentId}/complete`,{},422);
    const pendingTicket=await admin.request(`${base}/uploads`,{...upload,uploadId:randomUUID(),filename:"Unfinished synthetic upload.pdf"});
    const unfinished=(await admin.request(base)).find((r:any)=>r.id===pendingTicket.attachmentId);
    assert.equal(unfinished.canReview,true);assert.equal(unfinished.status,"awaiting_upload");
    await admin.request(`${base}/${unfinished.id}/review`,{decision:"reject",reason,expectedUpdatedAt:unfinished.updatedAt});
    await admin.request(`${base}/${unfinished.id}/complete`,{},409);
    console.log(`Passed ${passed} HTTP checks plus sealed-byte, idempotency, SQL immutability and retained rejected-file assertions.`);
  }finally{
    if(pid)await admin.request(`/patients/${pid}`,{status:"inactive"},200,"PATCH").catch(()=>{});
    for(const c of clients)await c.request("/auth/logout",{}).catch(()=>{});
    await pool.end();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
