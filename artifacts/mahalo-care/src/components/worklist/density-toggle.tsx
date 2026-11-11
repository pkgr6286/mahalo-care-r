import { Rows3, Rows4 } from "lucide-react";
import { useDensity } from "@/hooks/use-workspace-prefs";
import { cn } from "@/lib/utils";

export function DensityToggle() {
  const { density, set, ready } = useDensity();
  const opts = [{ id: "comfortable", label: "Comfortable", icon: Rows3 }, { id: "compact", label: "Compact", icon: Rows4 }] as const;
  return (
    <div role="radiogroup" aria-label="Row density" className="inline-flex h-9 items-center rounded-full border border-input bg-card p-0.5" data-testid="toggle-density">
      {opts.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={density === o.id} disabled={!ready} title={o.label} onClick={() => density !== o.id && set(o.id)}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors", density === o.id ? "bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))]" : "text-muted-foreground hover:text-foreground")}
          data-testid={"button-density-" + o.id}>
          <o.icon className="h-3.5 w-3.5" strokeWidth={1.6} /><span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
