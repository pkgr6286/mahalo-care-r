import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { ingestInbox, records } from "@workspace/db";
import { ReceiveDeviceWebhookBody } from "@workspace/api-zod";
import { config } from "./config";
import { allRecords, id, writeAudit, type Store, type Actor } from "./store";
import { AppError, requireValue } from "./errors";
import { ingestReading } from "./observations";
import { runRules } from "./rules";
import { enqueueJob } from "./job-store";

export const systemActor:Actor={id:"system-worker",name:"Mahalo background worker",role:"admin",credential:"admin",email:"worker@example.test"};
const signingKey=()=>createHmac("sha256",config.SESSION_SECRET).update("mahalo:synthetic-device:v1").digest();
export const signDeviceEvent=(timestamp:string,raw:Buffer)=>createHmac("sha256",signingKey()).update(`${timestamp}.`).update(raw).digest("hex");
export function verifyDeviceSignature(timestamp:string,signature:string,raw:Buffer,clock=Date.now()) {
  if(!/^\d{10,13}$/.test(timestamp)||Math.abs(clock-Number(timestamp))>300000||!/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected=Buffer.from(signDeviceEvent(timestamp,raw),"hex"),actual=Buffer.from(signature,"hex");
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export const inboxView=(r:typeof ingestInbox.$inferSelect)=>({id:r.id,source:r.source,eventId:r.eventId,deviceId:r.deviceId,status:r.status,signatureValid:r.signatureValid==="true",receivedAt:r.receivedAt.toISOString(),processedAt:r.processedAt?.toISOString()??null,error:r.error});
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export async function acceptDeviceEvent(s:Store,raw:Buffer,timestamp:string,signature:string,actor=systemActor) {
  if(!verifyDeviceSignature(timestamp,signature,raw)) throw new AppError(401,"Invalid device signature or expired timestamp");
  let json:unknown;try{json=JSON.parse(raw.toString("utf8"));}catch{throw new AppError(400,"Invalid device JSON");}
  const payload=ReceiveDeviceWebhookBody.parse(json);
  const devices=(await allRecords(s,"devices")).filter(r=>["assigned","active"].includes(r.status)&&String(r.metadata.serial)===payload.deviceSerial);
  if(devices.length!==1||!devices[0]!.patientId) throw new AppError(422,"Device is not uniquely assigned to an active patient");
  const device=devices[0]!;
  const [row]=await s.insert(ingestInbox).values({id:id(),eventId:`simulator:${payload.eventId}`,source:"simulator",deviceId:device.id,payload:payload as unknown as Record<string,unknown>,signatureValid:"true"}).onConflictDoNothing({target:ingestInbox.eventId}).returning();
  if(!row) {
    const [prior]=await s.select().from(ingestInbox).where(eq(ingestInbox.eventId,`simulator:${payload.eventId}`));
    if(prior?.deviceId!==device.id || canonical(prior.payload)!==canonical(payload)) throw new AppError(409,"Event identifier was already used for a different payload");
    return requireValue(prior);
  }
  await enqueueJob(s,"device_ingest",`inbox:${row.id}`,{inboxId:row.id});
  await writeAudit(s,actor,"receive_device_webhook",row.id,device.patientId,{driver:"simulator"});
  return row;
}
const parameters:Record<string,{title:string;unit:string}> = {
  "8480-6":{title:"Blood pressure",unit:"mmHg"},"8462-4":{title:"Diastolic blood pressure",unit:"mmHg"},
  "29463-7":{title:"Weight",unit:"kg"},"2339-0":{title:"Blood glucose",unit:"mg/dL"},
  "8867-4":{title:"Heart rate",unit:"/min"},"59408-5":{title:"Oxygen saturation",unit:"%"},
};
export async function processDeviceEvent(s:Store,inboxId:string) {
  const [row]=await s.select().from(ingestInbox).where(eq(ingestInbox.id,inboxId));
  const inbox=requireValue(row,"Inbox event not found");
  if(inbox.status==="processed") return {observations:0,replayed:true};
  const payload=ReceiveDeviceWebhookBody.parse(inbox.payload);
  const device=requireValue((await allRecords(s,"devices")).find(r=>r.id===inbox.deviceId),"Assigned device not found");
  if(!["assigned","active"].includes(device.status)||!device.patientId) throw new AppError(409,"Device assignment is inactive");
  if(!(await allRecords(s,"enrollments")).some(r=>r.patientId===device.patientId&&r.program===device.program&&r.status==="active")) throw new AppError(409,"Monitoring enrollment is not active");
  let count=0;
  for(const reading of payload.readings) {
    const parameter=parameters[reading.loinc]!;
    if(reading.unit!==parameter.unit) throw new AppError(400,`Unit must be ${parameter.unit} for this parameter`);
    const at=new Date(reading.measuredAt).toISOString();
    const before=(await allRecords(s,"observations")).some(r=>r.metadata.deviceId===device.id&&r.metadata.loinc===reading.loinc&&r.date===at);
    await ingestReading(s,{patientId:device.patientId,program:device.program,title:parameter.title,value:reading.value,unit:reading.unit,date:at,metadata:{loinc:reading.loinc,diastolic:reading.diastolic,source:"device",deviceId:device.id,inboxId:inbox.id,deviceCleared:device.metadata.fdaCleared===true||device.metadata.deviceCleared===true,simulated:true}},systemActor,true);
    if(!before) count++;
  }
  await runRules(s,systemActor,{action:"evaluateRules",patientId:device.patientId});
  await s.update(ingestInbox).set({status:"processed",processedAt:new Date(),error:null}).where(eq(ingestInbox.id,inbox.id));
  const [updated]=await s.update(records).set({metadata:{...device.metadata,lastSeenAt:new Date().toISOString()}}).where(eq(records.id,device.id)).returning();
  return {observations:count,deviceId:updated?.id??device.id};
}
