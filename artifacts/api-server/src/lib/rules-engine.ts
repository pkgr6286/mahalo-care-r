export type RuleSignal = {date:string;value:number;kind:string;metadata:Record<string,unknown>};
export type RuleDefinition = {
  kind:string;threshold?:number;op?:string;low?:number;high?:number;days?:number;
  windowDays?:number;minPoints?:number;rate?:number;code?:string;
};
export function evaluateRule(rule:RuleDefinition,signals:RuleSignal[],clock:Date,evidence?:{minutes:number;deviceDays:number}): {matched:boolean;observed:number;explanation:string} {
  const cutoff=clock.getTime()-(rule.windowDays||7)*86400000;
  const window=signals.filter(s=>Date.parse(s.date)>=cutoff&&Date.parse(s.date)<=clock.getTime());
  const observations=window.filter(s=>s.kind==="observations"&&s.metadata.valid!==false);
  const compare=(value:number)=>rule.op==="lt"?value<(rule.threshold||0):rule.op==="outside"?value<(rule.low||0)||value>(rule.high||0):value>=(rule.threshold||0);
  switch(rule.kind) {
    case "threshold": {
      const value=observations[0]?.value||0;
      return {matched:observations.length>0&&compare(value),observed:value,explanation:"Latest valid reading compared with the configured threshold"};
    }
    case "trend": {
      const mean=observations.length?observations.reduce((n,s)=>n+s.value,0)/observations.length:0;
      return {matched:observations.length>=(rule.minPoints||4)&&compare(mean),observed:mean,explanation:"Window mean compared with the configured threshold"};
    }
    case "missing_data": {
      const latest=signals.filter(s=>["observations","responses"].includes(s.kind)).sort((a,b)=>b.date.localeCompare(a.date))[0];
      const days=latest?(clock.getTime()-Date.parse(latest.date))/86400000:365;
      return {matched:days>=(rule.days||3),observed:days,explanation:"Days since the last reading or check-in"};
    }
    case "adherence": {
      const tasks=window.filter(s=>s.kind==="tasks");
      const rate=tasks.length?tasks.filter(s=>s.metadata.status==="completed").length/tasks.length:1;
      return {matched:tasks.length>0&&rate<(rule.rate??0.5),observed:rate*100,explanation:"Completion percentage for tasks in the window"};
    }
    case "score": {
      const score=window.find(s=>s.kind==="responses");
      return {matched:!!score&&compare(score.value),observed:score?.value||0,explanation:"Latest instrument score compared with the configured threshold"};
    }
    case "time_budget": {
      const short=Math.max(0,(rule.threshold||20)-(evidence?.minutes||0));
      return {matched:short>0,observed:short,explanation:"Eligible minutes still required for the configured management target"};
    }
    case "device_days_at_risk": {
      const short=Math.max(0,(rule.threshold||16)-(evidence?.deviceDays||0));
      return {matched:short>0,observed:short,explanation:"Counted device days still required for the configured supply target"};
    }
    default: throw new Error("Unsupported clinical rule kind");
  }
}
