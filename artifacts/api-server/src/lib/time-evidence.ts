/** Match the billing engine's actual minutes inputs, not the display label alone. */
export function timeEvidence<T>(program:string,code:{requires:{minutes_min?:number};minutes_bucket?:string}|undefined,sources:{eligible:T[];staff:T[];practitioner:T[]}):T[] {
  if(code?.requires.minutes_min===undefined) return [];
  if(code.minutes_bucket==="practitioner") return sources.practitioner;
  return ["RPM","RTM"].includes(program)?sources.eligible:sources.staff;
}
