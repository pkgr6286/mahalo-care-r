import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Logo, SyntheticRibbon } from "@/components/shell";
import { inputCls } from "@/components/kit";
import { cn } from "@/lib/utils";

export function AuthFrame({ eyebrow, title, desc, children, footer }: { eyebrow: string; title: string; desc?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <SyntheticRibbon />
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
        <svg className="pointer-events-none absolute -right-48 -top-48 h-[560px] w-[560px]" viewBox="0 0 600 600" fill="none" aria-hidden>
          <circle cx="300" cy="300" r="290" stroke="#FF7A21" strokeOpacity=".18" />
          <circle cx="300" cy="300" r="220" stroke="#F44762" strokeOpacity=".14" />
          <circle cx="300" cy="300" r="150" stroke="#20B5D0" strokeOpacity=".16" />
        </svg>
        <div className="rise relative w-full max-w-[420px]">
          <div className="mb-8"><Logo height={30} /></div>
          <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-[var(--shadow-md)]">
            <div className="h-[3px] brand-rule" />
            <div className="p-7">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</div>
              <h1 className="mt-2 text-[30px] leading-tight">{title}</h1>
              {desc && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>}
              <div className="mt-6">{children}</div>
            </div>
          </div>
          {footer && <div className="mt-5 text-center text-xs text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function PasswordInput({ value, onChange, autoComplete, testid, id, invalid }: { value: string; onChange: (v: string) => void; autoComplete: string; testid: string; id?: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} maxLength={128} className={cn(inputCls, "!h-11 pr-10", invalid && "border-destructive/60")} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} data-testid={testid} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={show ? "Hide password" : "Show password"} data-testid={testid + "-toggle"}>
        {show ? <EyeOff className="h-4 w-4" strokeWidth={1.6} /> : <Eye className="h-4 w-4" strokeWidth={1.6} />}
      </button>
    </div>
  );
}

export function passwordProblem(pw: string, confirm: string): string | null {
  if (pw.length < 12) return "Use at least 12 characters.";
  if (pw.length > 128) return "Use 128 characters or fewer.";
  if (pw !== confirm) return "The two passwords don't match.";
  return null;
}

export function StrengthMeter({ pw }: { pw: string }) {
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const score = pw.length === 0 ? 0 : pw.length < 12 ? 1 : Math.min(4, 1 + Math.floor(pw.length / 16) + (variety >= 3 ? 1 : 0) + (variety === 4 ? 1 : 0));
  const label = ["", "Too short", "Acceptable", "Strong", "Very strong"][score];
  const color = ["bg-muted", "bg-destructive", "bg-[hsl(var(--brand-orange))]", "bg-[hsl(var(--brand-cyan))]", "bg-[hsl(162_60%_34%)]"][score];
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">{[1, 2, 3, 4].map((i) => <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= score ? color : "bg-muted")} />)}</div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span data-testid="text-password-strength">{label || "12 to 128 characters"}</span><span className="tnum">{pw.length}/128</span></div>
    </div>
  );
}

export function FormAlert({ tone = "error", children, testid }: { tone?: "error" | "ok" | "info"; children: ReactNode; testid?: string }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} data-testid={testid} className={cn("rounded-lg border px-3 py-2 text-xs leading-relaxed",
      tone === "error" && "border-destructive/25 bg-[hsl(352_80%_97.5%)] text-destructive",
      tone === "ok" && "border-[hsl(162_40%_75%)] bg-[hsl(162_45%_96%)] text-[hsl(162_60%_24%)]",
      tone === "info" && "border-[hsl(188_50%_75%)] bg-[hsl(185_55%_97%)] text-[hsl(188_70%_24%)]")}>{children}</div>
  );
}
