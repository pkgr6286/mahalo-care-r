import { VIEWS, type WlKind } from "@/lib/worklist";
import { cn } from "@/lib/utils";

export function WorklistNav({ value, allowed, onChange }: { value: WlKind; allowed: WlKind[]; onChange: (k: WlKind) => void }) {
  const views = VIEWS.filter((v) => allowed.includes(v.id));
  return (
    <nav aria-label="Worklist views" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {views.map((v) => {
          const on = v.id === value;
          return (
            <li key={v.id}>
              <button type="button" onClick={() => onChange(v.id)} aria-current={on ? "page" : undefined} data-testid={"tab-wl-" + v.id}
                className={cn("relative flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                  on ? "bg-card font-medium text-foreground shadow-[var(--shadow-sm)] ring-1 ring-border" : "text-foreground/65 hover:bg-secondary hover:text-foreground")}>
                {on && <span className="absolute -left-0 top-2 bottom-2 hidden w-[3px] rounded-r-full bg-[hsl(var(--brand-orange))] lg:block" />}
                <v.icon className={cn("h-4 w-4 shrink-0", on ? "text-primary" : "text-foreground/45")} strokeWidth={1.5} />
                {v.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
