import {z} from "zod";
const clock=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/,"Use a 24-hour HH:mm time");
export const quietHoursSchema=z.object({enabled:z.boolean(),start:clock,end:clock}).strict().refine(q=>q.start!==q.end,"Quiet hours must have different start and end times");
export const communicationPreferencesSchema=z.object({email:z.boolean(),sms:z.boolean(),push:z.boolean(),quietHours:quietHoursSchema.optional()}).strict();
export type QuietHours=z.infer<typeof quietHoursSchema>;
const formatters=new Map<string,Intl.DateTimeFormat>();
function localMinute(at:Date,timeZone:string) {
  let formatter=formatters.get(timeZone);
  if(!formatter){
    formatter=new Intl.DateTimeFormat("en-US",{timeZone,hourCycle:"h23",hour:"2-digit",minute:"2-digit"});
    if(formatters.size>=100)formatters.delete(formatters.keys().next().value!);
    formatters.set(timeZone,formatter);
  }
  const parts=formatter.formatToParts(at);
  return Number(parts.find(p=>p.type==="hour")!.value)*60+Number(parts.find(p=>p.type==="minute")!.value);
}
const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
export function withinQuietHours(at:Date,timeZone:string,quiet?:QuietHours) {
  if(!Number.isFinite(at.getTime()))throw new Error("Invalid notification clock");
  if(!quiet?.enabled)return false;
  quietHoursSchema.parse(quiet);
  const minute=localMinute(at,timeZone),start=minutes(quiet.start),end=minutes(quiet.end);
  return start<end?minute>=start&&minute<end:minute>=start||minute<end;
}
/** Walk actual instants, not invented local timestamps: handles skipped/repeated DST clock hours. */
export function nextAllowedNotificationAt(at:Date,timeZone:string,quiet?:QuietHours) {
  if(!withinQuietHours(at,timeZone,quiet))return at;
  let tick=(Math.floor(at.getTime()/60000)+1)*60000;
  for(let i=0;i<26*60;i++,tick+=60000)if(!withinQuietHours(new Date(tick),timeZone,quiet))return new Date(tick);
  throw new Error("Unable to resolve the end of notification quiet hours");
}
