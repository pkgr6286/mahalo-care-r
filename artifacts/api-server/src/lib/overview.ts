import { db, patients, audit, type RecordRow } from "@workspace/db";
import { desc } from "drizzle-orm";
import { allRecords, patientView, serializeRecord } from "./store";

export async function overview() {
  const [ps,rs,events]=await Promise.all([
    db.select().from(patients),allRecords(),db.select().from(audit).orderBy(desc(audit.at)).limit(12),
  ]);
  const views=ps.map(p=>patientView(p,rs));
  const open=rs.filter(r=>r.kind==="exceptions"&&["open","acknowledged"].includes(r.status));
  const active=rs.filter(r=>r.kind==="enrollments"&&r.status==="active");
  const time=rs.filter(r=>r.kind==="time"&&r.status==="committed"&&r.date.startsWith(new Date().toISOString().slice(0,7)));
  const programStats=rs.filter(r=>r.kind==="programs").map(r=>({
    key:r.program||"",name:r.title,enrolled:active.filter(e=>e.program===r.program).length,
    atRisk:open.filter(e=>e.program===r.program).length,
    minutes:time.filter(t=>t.program===r.program).reduce((n,t)=>n+t.value,0),
    color:String(r.metadata.color||"#3D36E8"),
  }));
  const trend=Array.from({length:7},(_,i)=>{
    const date=new Date();date.setUTCDate(date.getUTCDate()-6+i);const key=date.toISOString().slice(0,10);
    return {label:date.toLocaleDateString("en-US",{weekday:"short",timeZone:"UTC"}),readings:rs.filter(r=>r.kind==="observations"&&r.date.startsWith(key)).length,completed:rs.filter(r=>r.kind==="tasks"&&r.status==="completed"&&String(r.metadata.completedAt||r.updatedAt.toISOString()).startsWith(key)).length,enrolled:active.filter(r=>r.date.startsWith(key)).length};
  });
  const activity=events.map(e=>({
    id:e.id,kind:"audit",title:e.action.replaceAll("_"," "),description:e.actorName,patientId:e.patientId,
    patientName:ps.find(p=>p.id===e.patientId)?.firstName||"",status:"recorded",date:e.at.toISOString(),createdAt:e.at.toISOString(),updatedAt:e.at.toISOString(),metadata:e.detail,
  }));
  const tasks=rs.filter(r=>r.kind==="tasks"&&r.status==="pending");
  const dashboard={
    patientCount:ps.length,activeEnrollments:active.length,openExceptions:open.length,criticalExceptions:open.filter(r=>r.severity==="critical").length,
    dueToday:tasks.filter(r=>r.date.slice(0,10)<=new Date().toISOString().slice(0,10)).length,
    atRisk:views.filter(p=>["high","critical"].includes(p.risk)).length,monthlyMinutes:time.reduce((n,t)=>n+t.value,0),
    eligibleLines:rs.filter(r=>r.kind==="billing"&&["candidate","approved"].includes(r.status)).length,
    exceptions:open.sort((a,b)=>severityOrder(a)-severityOrder(b)).map(r=>serializeRecord(r,ps)),
    tasks:tasks.slice(0,12).map(r=>serializeRecord(r,ps)),activity,programStats,trend,
  };
  const staffTime=rs.filter(r=>r.kind==="staff").map(r=>({
    ...serializeRecord(r,ps),value:time.filter(t=>t.assignee===r.title).reduce((n,t)=>n+t.value,0),unit:"min",
    metadata:{...r.metadata,entries:time.filter(t=>t.assignee===r.title).length},
  }));
  const locations=rs.filter(r=>r.kind==="locations").map(r=>({...serializeRecord(r,ps),value:ps.filter(p=>p.location===r.title).length,unit:"patients"}));
  return {dashboard,reports:{programStats,trend,staffTime,locations,integrationHealth:rs.filter(r=>r.kind==="integrations").map(r=>serializeRecord(r,ps))}};
}
function severityOrder(r:RecordRow) { return ["critical","high","medium","low"].indexOf(r.severity); }
