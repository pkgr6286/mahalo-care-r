import {useListProgramPolicies,getListProgramPoliciesQueryKey} from "@workspace/api-client-react";
import {Pill} from "@/components/kit";
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function useEnrollmentPolicy(program:string,enabled:boolean) {
  const query=useListProgramPolicies({query:{enabled,queryKey:getListProgramPoliciesQueryKey()}});
  const today=new Date().toISOString().slice(0,10),rows=(query.data?.items??[]).filter(p=>p.kind==="rulepack"&&p.program===program);
  const published=rows.filter(p=>p.status==="published"&&p.effectiveFrom<=today).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||(b.publishedAt??"").localeCompare(a.publishedAt??""))[0];
  const selected=published??rows.find(p=>p.status==="bundled"),eligibility=obj(selected?.body.eligibility);
  return {query,selected,requiresDeviceSharing:Array.isArray(eligibility.required_consents)&&eligibility.required_consents.includes("device_sharing"),conditionMonths:Number(eligibility.condition_min_duration_months??0),visitMonths:Number(eligibility.initiating_visit_required_within_months??0)};
}
export function EnrollmentPolicySummary({selected}:{selected:ReturnType<typeof useEnrollmentPolicy>["selected"]}) {
  if(!selected) return null;
  return <div className="rounded-lg border border-border bg-muted/35 p-3 text-xs" data-testid="enrollment-policy">
    <div className="mb-2 flex flex-wrap items-center gap-2 font-medium">Policy {selected.version}<Pill tone="amber">Provisional</Pill></div>
    <p className="leading-relaxed text-muted-foreground">{typeof selected.body.consent_text==="string"?selected.body.consent_text:"Review this program's consent requirements before enrolling."}</p>
    <p className="mt-2 text-muted-foreground">This version is retained with the enrollment. Future policy publication does not change it.</p>
  </div>;
}
