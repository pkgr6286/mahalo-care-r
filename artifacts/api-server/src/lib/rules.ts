import { allRecords, addRecord, patchRecord, getPatientRow, getRecord, patientView, now, type Store, type Actor } from "./store";
import { evaluateRule, type RuleDefinition } from "./rules-engine";
import { assertKind } from "./observations";
import type { Action } from "./actions";

export async function runRules(s:Store,actor:Actor,a:Action) {
  const p=await getPatientRow(s,a.patientId),rs=await allRecords(s);
  const mine=rs.filter(r=>r.patientId===p.id);
  const signals=mine.map(r=>({date:r.date,value:r.value,kind:r.kind,metadata:{...r.metadata,status:r.status}}));
  const view=patientView(p,rs), changed=[];
  const rules=a.id?[await getRecord(s,a.id,"rules")]:rs.filter(r=>r.kind==="rules"&&r.status==="active");
  for(const rule of rules) {
    assertKind(rule,"rules");
    if(rule.program&&!view.programs.includes(rule.program)) continue;
    const definition=rule.metadata as unknown as RuleDefinition;
    const outcome=evaluateRule(definition,signals,new Date(),{minutes:view.minutes,deviceDays:view.deviceDays});
    if(a.action==="testRule") {
      changed.push(await addRecord(s,"interactions",{title:`Rule preview: ${rule.title}`,patientId:p.id,program:rule.program,status:outcome.matched?"matched":"not_matched",description:outcome.explanation,value:outcome.observed,metadata:{...outcome,ruleId:rule.id,preview:true}},actor));
      continue;
    }
    if(outcome.matched) {
      const open=mine.find(r=>r.kind==="exceptions"&&r.metadata.ruleId===rule.id&&["open","acknowledged"].includes(r.status));
      const metadata={ruleId:rule.id,ruleKey:rule.id,signalCount:open?Number(open.metadata.signalCount||1)+1:1,lastSignalAt:now(),...outcome};
      changed.push(open?await patchRecord(s,open,{value:outcome.observed,metadata},actor,"rule_signal"):await addRecord(s,"exceptions",{patientId:p.id,program:rule.program,title:rule.title,status:"open",severity:rule.severity,description:outcome.explanation,value:outcome.observed,assignee:rule.assignee,metadata},actor));
    }
  }
  return changed;
}
