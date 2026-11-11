import type { RecordRow } from "@workspace/db";
import { allRecords, addRecord, patchRecord, getPatientRow, type Store, type Actor } from "./store";
import { AppError } from "./errors";

type PlanItem = {id:string;title:string;kind:string;rrule:string;hour:number;windowMinutes:number};
const weekdays=["SU","MO","TU","WE","TH","FR","SA"];
export function validateSchedule(rrule:string) {
  const fields:Record<string,string>=Object.fromEntries(rrule.toUpperCase().replace(/^RRULE:/,"").split(";").map(part=>part.split("=")));
  if (!["DAILY","WEEKLY"].includes(fields.FREQ??"")) throw new AppError(400,"Schedules support FREQ=DAILY or FREQ=WEEKLY");
  if (Object.keys(fields).some(k=>!["FREQ","INTERVAL","BYDAY"].includes(k))) throw new AppError(400,"Use only FREQ, INTERVAL and BYDAY in a schedule");
  const interval=Number(fields.INTERVAL??1);
  if (!Number.isInteger(interval)||interval<1||interval>52) throw new AppError(400,"Schedule interval must be between 1 and 52");
  const days=fields.BYDAY?.split(",")??[];
  if (days.some(d=>!weekdays.includes(d))) throw new AppError(400,"Schedule days must be MO,TU,WE,TH,FR,SA,SU");
  return {frequency:fields.FREQ!,interval,days};
}
export function scheduleMatches(rrule:string,day:string,anchor:string) {
  const r=validateSchedule(rrule),d=new Date(`${day}T12:00:00Z`),a=new Date(`${anchor}T12:00:00Z`);
  const diff=Math.floor((d.getTime()-a.getTime())/86400000);
  if (diff<0) return false;
  if (r.days.length&&!r.days.includes(weekdays[d.getUTCDay()]!)) return false;
  return r.frequency==="DAILY"?diff%r.interval===0:Math.floor(diff/7)%r.interval===0&&(r.days.length>0||d.getUTCDay()===a.getUTCDay());
}
export function localDate(at:Date,timezone:string) {
  return new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(at);
}
export function localHourInstant(day:string,hour:number,timezone:string) {
  const target=Date.parse(`${day}T${String(hour).padStart(2,"0")}:00:00Z`);
  let value=target;
  // Resolve local wall time to an instant; use midday defaults so DST gaps are not scheduled.
  for(let i=0;i<4;i++) {
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
    const get=(t:string)=>parts.find(p=>p.type===t)!.value;
    const wall=Date.parse(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`);
    const delta=target-wall;if(!delta) break;value+=delta;
  }
  return new Date(value).toISOString();
}
export function planItems(plan:Pick<RecordRow,"metadata"|"program">): PlanItem[] {
  const raw=plan.metadata.items;
  if(!Array.isArray(raw)) return [{id:"daily-checkin",title:`Daily ${plan.program} check-in`,kind:"checkin",rrule:"FREQ=DAILY",hour:12,windowMinutes:720}];
  const items=raw.map((item,i)=>{
    const x=item as Record<string,unknown>;
    if(!x||typeof x!=="object"||!String(x.title??"").trim()) throw new AppError(400,"Every plan item needs a title");
    const rrule=String(x.rrule??"FREQ=DAILY");validateSchedule(rrule);
    const hour=Number(x.hour??12),windowMinutes=Number(x.windowMinutes??720);
    if(!Number.isInteger(hour)||hour<0||hour>23||!Number.isFinite(windowMinutes)||windowMinutes<1||windowMinutes>1440) throw new AppError(400,"Invalid task time or completion window");
    return {id:String(x.id??i),title:String(x.title),kind:String(x.kind??"custom"),rrule,hour,windowMinutes};
  });
  if(items.some(item=>!item.id.trim())||new Set(items.map(item=>item.id)).size!==items.length) throw new AppError(400,"Scheduled items require distinct, non-empty identifiers");
  return items;
}
export async function materializeTasks(s:Store,actor:Actor,patientId:string,clock=new Date()) {
  const p=await getPatientRow(s,patientId),rs=await allRecords(s),today=localDate(clock,p.timezone),created=[];
  for(const plan of rs.filter(r=>r.patientId===p.id&&r.kind==="careplans"&&r.status==="active")) {
    const active=rs.some(r=>r.patientId===p.id&&r.kind==="enrollments"&&r.program===plan.program&&r.status==="active");
    if(!active) continue;
    const anchor=String(plan.metadata.scheduleStart??localDate(new Date(plan.metadata.signedAt as string||plan.createdAt),p.timezone));
    for(const item of planItems(plan)) for(let offset=0;offset<14;offset++) {
      const day=new Date(`${today}T12:00:00Z`);day.setUTCDate(day.getUTCDate()+offset);
      const date=day.toISOString().slice(0,10);
      if(!scheduleMatches(item.rrule,date,anchor)) continue;
      const scheduleKey=`${plan.id}:${item.id}:${date}`;
      if(rs.some(r=>r.kind==="tasks"&&r.metadata.scheduleKey===scheduleKey)) continue;
      const dueAt=localHourInstant(date,item.hour,p.timezone);
      const row=await addRecord(s,"tasks",{title:item.title,patientId:p.id,program:plan.program,status:"pending",date:dueAt,metadata:{carePlanId:plan.id,itemId:item.id,scheduleKey,taskKind:item.kind,audience:"patient",dueAt,windowMinutes:item.windowMinutes,source:"careplan"}},actor);
      rs.push(row);created.push(row);
    }
    const lastReview=rs.filter(r=>r.kind==="interactions"&&r.metadata.carePlanId===plan.id&&r.metadata.kind==="care_plan_review").sort((a,b)=>b.date.localeCompare(a.date))[0];
    const reviewed=lastReview?.date??String(plan.metadata.signedAt??plan.createdAt.toISOString());
    const dueDay=new Date(`${localDate(new Date(reviewed),p.timezone)}T12:00:00Z`);
    dueDay.setUTCDate(dueDay.getUTCDate()+Math.max(1,Number(plan.metadata.reviewDays??30)));
    const reviewDate=dueDay.toISOString().slice(0,10),horizon=new Date(`${today}T12:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate()+14);
    const key=`${plan.id}:review:${reviewDate}`;
    if(dueDay<=horizon&&!rs.some(r=>r.kind==="tasks"&&r.metadata.scheduleKey===key)) {
      const dueAt=localHourInstant(reviewDate,12,p.timezone);
      created.push(await addRecord(s,"tasks",{title:`Review ${plan.program} care plan`,patientId:p.id,program:plan.program,status:"pending",date:dueAt,metadata:{carePlanId:plan.id,scheduleKey:key,taskKind:"care_plan_review",audience:"staff",dueAt,source:"careplan"}},actor));
    }
  }
  return created;
}
export async function markMissedTasks(s:Store,actor:Actor,clock=new Date()) {
  let missed=0;
  for(const task of await allRecords(s,"tasks")) {
    if(task.status!=="pending"||task.metadata.audience!=="patient") continue;
    const end=Date.parse(String(task.metadata.dueAt??task.date))+Number(task.metadata.windowMinutes??720)*60000;
    if(Number.isFinite(end)&&end<clock.getTime()) {
      await patchRecord(s,task,{status:"missed",metadata:{...task.metadata,missedAt:clock.toISOString()}},actor,"missed");missed++;
    }
  }
  return missed;
}
