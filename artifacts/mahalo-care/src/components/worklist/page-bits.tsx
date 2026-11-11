export { EmptyState, ErrorState, PageHeader, SkeletonRows } from "@/components/kit";
import { ReadOnlyHint } from "@/components/access";

export function ReadOnlyHintSlot() {
  return <div className="flex items-center gap-2 text-xs text-muted-foreground"><ReadOnlyHint />You can review this worklist. Actions need write access for this area.</div>;
}
