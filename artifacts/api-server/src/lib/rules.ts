import {users} from "@workspace/db";
import {allRecords,addRecord,patchRecord,getPatientRow,getRecord,now,writeAudit,type Store,type Actor} from "./store";
import {evaluateRule,type RuleSignal} from "./rules-engine";
import {parseClinicalRule} from "./clinical-rule-schema";
import {assertKind} from "./observations";
import type {Action} from "./actions";
import {createHash} from "node:crypto";
import {policyCatalog} from "./program-policies";
import {ruleEvidence} from "./rule-evidence";
import {notifyRuleMatch} from "./rule-notifications";
import {hasPermission,inLocation} from "./access";
import {AppError} from "./errors";
const rank:Record<string,number>={none:0,low:1,medium:2,high:3,critical:4};
export async function runRules(s:Store,actor:Actor,a:Action) {
  const p=await getPatientRow(s,a.patientId),rs=await allRecords(s),clock=new Date();
  if(p.status!=="active"&&a.action!=="testRule") return [];
  const mine=rs.filter(r=>r.patientId===p.id),changed=[],catalog=await policyCatalog(s);
  const staff=(await s.select().from(users)).filter(u=>u.status==="active"&&u.role!=="patient"&&inLocation({role:u.role,locationScopes:u.locationScopes} as Actor,p.location));
  const rules=a.id?[await getRecord(s,a.id,"rules")]:rs.filter(r=>r.kind==="rules"&&r.status==="active");
  for(const rule of rules) {
    assertKind(rule,"rules");
    if(rule.patientId&&rule.patientId!==p.id) {
      if(a.action==="testRule") throw new AppError(403,"This rule belongs to a different patient");
      continue;
    }
    let definition;
    try {definition=parseClinicalRule(rule.metadata);}
    catch(error) {
      if(a.action==="testRule") throw error;
      if(!rs.some(r=>r.kind==="tasks"&&r.metadata.invalidRuleId===rule.id&&["pending","open"].includes(r.status))) {
        changed.push(await addRecord(s,"tasks",{title:"Review an invalid clinical rule",status:"pending",severity:"high",description:error instanceof Error?error.message:"Invalid rule configuration",metadata:{audience:"staff",invalidRuleId:rule.id,ownerRole:"admin"}},actor));
        await writeAudit(s,actor,"rule_configuration_failed",rule.id,null,{message:error instanceof Error?error.message:"Invalid configuration"});
      }
      continue;
    }
    const program=definition.program_key??rule.program??undefined;
    if(rule.program&&definition.program_key&&rule.program!==definition.program_key) throw new AppError(400,"Rule program and program_key must match");
    if(a.action!=="testRule"&&!mine.some(r=>r.kind==="enrollments"&&r.status==="active"&&(!program||r.program===program))) continue;
    const relevant=mine.filter(r=>(!program||r.program===program)&&["observations","responses","tasks","adherence","time","interactions"].includes(r.kind)).filter(r=>{
      if(r.kind!=="tasks") return true;
      if(r.metadata.audience==="staff") return false;
      const due=Date.parse(String(r.metadata.dueAt??r.date));
      return due<=clock.getTime()&&(r.status!=="pending"||due+Number(r.metadata.windowMinutes??720)*60000<=clock.getTime());
    });
    const signals:RuleSignal[]=relevant.map(r=>{
      const instrument=String(r.metadata.instrument??r.metadata.instrument_key??""),definition=rs.find(i=>i.kind==="instruments"&&i.metadata.key===instrument);
      const bands=Array.isArray(definition?.metadata.bands)?definition.metadata.bands as {min?:number;max?:number;from?:number;to?:number;label?:string;key?:string}[]:[];
      const band=bands.find(b=>r.value>=Number(b.min??b.from??0)&&r.value<=Number(b.max??b.to??Infinity));
      return {id:r.id,date:r.kind==="tasks"?String(r.metadata.completedAt??r.date):r.date,value:r.value,kind:r.kind,metadata:{...r.metadata,status:r.status,kind:r.metadata.kind??r.metadata.taskKind??r.metadata.adherenceKind,barrier:r.metadata.barrierCode??r.metadata.barrier,instrument,band:r.metadata.band??band?.key??band?.label,loinc:r.metadata.loinc??(r.kind==="observations"&&r.unit==="mmHg"?"8480-6":undefined)}};
    });
    let evidence;
    try {evidence=ruleEvidence(definition,program,p,mine,catalog,clock);}
    catch(error) {
      if(a.action==="testRule") throw error;
      if(!rs.some(r=>r.kind==="tasks"&&r.metadata.invalidRuleId===rule.id&&["pending","open"].includes(r.status))) changed.push(await addRecord(s,"tasks",{title:"Review a clinical rule's policy reference",status:"pending",severity:"high",description:error instanceof Error?error.message:"Invalid target policy",metadata:{audience:"staff",invalidRuleId:rule.id,ownerRole:"admin"}},actor));
      continue;
    }
    const outcome=evaluateRule(definition,signals,clock,evidence);
    if(a.action==="testRule") {changed.push(await addRecord(s,"interactions",{title:`Rule preview: ${rule.title}`,patientId:p.id,program:program??null,status:outcome.matched?"matched":"not_matched",description:outcome.explanation,value:outcome.observed,metadata:{...outcome,ruleId:rule.id,preview:true,evidence,definition,provisional:true}},actor));continue;}
    if(!outcome.matched) continue;
    const ruleKey=definition.legacy_key??(definition.kind==="threshold"&&program==="RPM"&&!definition.loinc&&!definition.any_of?"bp_critical":rule.id);
    const open=mine.find(r=>r.kind==="exceptions"&&(r.metadata.ruleId===rule.id||(!r.metadata.ruleId&&r.metadata.ruleKey===ruleKey))&&["open","acknowledged"].includes(r.status));
    const fingerprint=createHash("sha256").update(JSON.stringify({definition,sourceIds:outcome.sourceIds,observed:["missing_data"].includes(definition.kind)?Math.floor(outcome.observed):outcome.observed,period:["time_budget","device_days_at_risk"].includes(definition.kind)?evidence.period:undefined,policy:evidence.policy})).digest("hex");
    if(open?.metadata.fingerprint===fingerprint||(!open&&mine.some(r=>r.kind==="exceptions"&&r.metadata.ruleId===rule.id&&["resolved","dismissed"].includes(r.status)&&r.metadata.fingerprint===fingerprint))) continue;
    const manualAssignment=open?.metadata.assignmentSource==="manual"||open?.status==="acknowledged";
    const named=staff.filter(u=>u.name===(open?.status==="acknowledged"?open.assignee:rule.assignee)&&(open?.status==="acknowledged"||!definition.owner_role||u.role===definition.owner_role)&&hasPermission({role:u.role} as Actor,"clinical.write"));
    const owner=manualAssignment?staff.find(u=>u.id===open?.metadata.ownerUserId):(named.length===1?named[0]:undefined)??staff.find(u=>u.role===definition.owner_role);
    const severity=open&&(rank[open.severity]??0)>(rank[rule.severity]??0)?open.severity:rule.severity;
    const priorWindow=Date.parse(String(open?.metadata.deduplicationWindowStartedAt??"")),sameWindow=Number.isFinite(priorWindow)&&Date.now()<priorWindow+definition.deduplication_window_minutes*60000,windowStart=sameWindow?new Date(priorWindow).toISOString():now();
    const metadata={...open?.metadata,ruleId:rule.id,ruleKey,fingerprint,definition,ruleVersion:definition.version,ownerRole:manualAssignment?open?.metadata.ownerRole??definition.owner_role??null:definition.owner_role??null,ownerUserId:owner?.id??null,sourceIds:outcome.sourceIds,metric:outcome.metric,signalCount:open?Number(open.metadata.signalCount||1)+1:1,deduplicationWindowStartedAt:windowStart,deduplicationWindowEndsAt:new Date(Date.parse(windowStart)+definition.deduplication_window_minutes*60000).toISOString(),windowSignalCount:sameWindow?Number(open?.metadata.windowSignalCount??1)+1:1,lastSignalAt:now(),evidence,provisional:true};
    let exception=open?await patchRecord(s,open,{value:outcome.observed,severity,assignee:owner?.name??"",description:outcome.explanation,metadata},actor,"rule_signal"):await addRecord(s,"exceptions",{patientId:p.id,program:program??null,title:rule.title,status:"open",severity,description:outcome.explanation,value:outcome.observed,assignee:owner?.name??"",metadata},actor);
    const notification=await notifyRuleMatch(s,actor,exception,definition,!open||open.severity!==exception.severity);
    exception=await patchRecord(s,exception,{metadata:{...exception.metadata,...notification}},actor,"rule_notification");
    changed.push(exception);
  }
  return changed;
}
