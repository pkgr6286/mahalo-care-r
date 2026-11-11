import { Gauge } from "lucide-react";
import { ConfirmButton, PageHeader } from "@/components/kit";
import { usePermission } from "@/components/access";
import { RulesManager } from "@/components/rules/rules-manager";
import { useAction } from "@/lib/api";

export default function RulesPage() {
  const { allow } = usePermission();
  const { run, pending } = useAction();
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Clinical"
        title="Clinical rules"
        desc="Thresholds, trends, missing data, adherence, scores and billing-period risk. Preview any rule against one patient's stored history before enabling it."
        actions={allow("clinical.write") ? <ConfirmButton size="md" label="Evaluate active rules" icon={<Gauge className="h-4 w-4" />} title="Evaluate active rules" desc="Runs every active rule for all active patients. New or updated exceptions appear in worklists." confirmLabel="Evaluate" pending={pending} onConfirm={(_, c) => run({ action: "evaluateRules" }, c)} testid="button-evaluate-rules" /> : undefined}
      />
      <RulesManager />
    </div>
  );
}
