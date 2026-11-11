import { useState, type ReactNode } from "react";
import { AlertTriangle, Inbox, RotateCw } from "lucide-react";
import type { CareRecord, RecordInput } from "@workspace/api-client-react";
import { useListPatients } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { errMsg, PROGRAMS, useSaveRecord, type Kind } from "@/lib/api";

/* ---------- Buttons ---------- */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "navy";
export function Btn({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-[background-color,border-color,color,transform,box-shadow] duration-200 ease-out active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-orange))]/50 focus-visible:ring-offset-1",
        size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm",
        variant === "primary" && "bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))] shadow-[inset_0_-2px_0_hsl(var(--brand-orange))] hover:bg-[hsl(220_5%_20%)]",
        variant === "navy" && "bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))] hover:bg-[hsl(220_5%_20%)]",
        variant === "secondary" && "border border-input bg-card text-foreground hover:border-foreground/25 hover:bg-secondary",
        variant === "ghost" && "text-muted-foreground hover:bg-muted hover:text-foreground",
        variant === "danger" && "border border-destructive/30 bg-card text-destructive hover:bg-destructive/5",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Pills ---------- */
export type Tone = "neutral" | "indigo" | "red" | "amber" | "green" | "navy" | "teal";
const toneCls: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  indigo: "bg-accent text-accent-foreground border-primary/15",
  red: "bg-[hsl(352_80%_97%)] text-[hsl(352_72%_36%)] border-[hsl(352_65%_86%)]",
  amber: "bg-[hsl(38_95%_95%)] text-[hsl(30_80%_34%)] border-[hsl(38_80%_82%)]",
  green: "bg-[hsl(150_40%_94.5%)] text-[hsl(152_60%_24%)] border-[hsl(150_35%_80%)]",
  navy: "bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))] border-transparent",
  teal: "bg-[hsl(189_60%_95%)] text-[hsl(192_80%_25%)] border-[hsl(189_50%_82%)]",
};
export function toneFor(v?: string | null): Tone {
  const s = (v ?? "").toLowerCase();
  if (["critical", "high", "urgent", "rejected", "failed", "error", "overdue", "discharged", "revoked", "invalid"].includes(s)) return "red";
  if (["warning", "medium", "pending", "draft", "due", "paused", "running", "acknowledged", "degraded", "review", "blocked", "open"].includes(s)) return "amber";
  if (["resolved", "signed", "active", "approved", "completed", "done", "met", "connected", "healthy", "ok", "committed", "accepted", "closed", "sent", "granted", "low"].includes(s)) return "green";
  if (["simulated", "sandbox"].includes(s)) return "teal";
  return "neutral";
}
export function Pill({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[11px] font-medium leading-5 capitalize whitespace-nowrap", toneCls[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
export function StatusPill({ value }: { value?: string | null }) {
  if (!value) return null;
  return <Pill tone={toneFor(value)} dot>{value.replace(/_/g, " ")}</Pill>;
}
export function ProgramTag({ p }: { p?: string | null }) {
  if (!p) return null;
  return <span className="inline-flex rounded-md border border-foreground/10 bg-secondary px-1.5 text-[10px] font-semibold tracking-[0.08em] text-foreground/80">{p.toUpperCase()}</span>;
}
export function SimLabel({ text = "Simulated" }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(189_50%_78%)] bg-[hsl(189_60%_96%)] px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[hsl(192_80%_25%)]" data-testid="label-simulated">
      {text}
    </span>
  );
}

/* ---------- Layout ---------- */
export function PageHeader({ eyebrow, title, desc, actions }: { eyebrow?: string; title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rise mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand-orange))]" />{eyebrow}</div>}
        <h1 className="text-[30px] leading-[1.1] text-foreground md:text-[36px]" data-testid="text-page-title">{title}</h1>
        {desc && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, sub, action, children, className, bodyClass }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn("rise rounded-2xl border border-card-border bg-card shadow-[var(--shadow-sm)]", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] leading-tight text-foreground">{title}</h2>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn("px-5 py-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone, icon, testid }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "red" | "indigo" | "amber" | "green"; icon?: ReactNode; testid?: string }) {
  return (
    <div className="rise lift rounded-2xl border border-card-border bg-card p-4 shadow-[var(--shadow-sm)]" data-testid={testid}>
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        <span className={cn(tone === "red" && "text-destructive", tone === "indigo" && "text-[hsl(192_80%_30%)]", tone === "amber" && "text-[hsl(30_80%_36%)]", tone === "green" && "text-[hsl(162_60%_30%)]")}>{icon}</span>
      </div>
      <div className="tnum mt-3 text-[30px] font-medium leading-none tracking-tight">{value}</div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: NoInfer<T>; label: string; count?: number }[]; value: T; onChange: (v: NoInfer<T>) => void; className?: string }) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto border-b border-border", className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          data-testid={`tab-${t.id}`}
          className={cn(
            "relative -mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            value === t.id ? "border-[hsl(var(--brand-orange))] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={cn("tnum rounded-full px-1.5 text-[10px] font-semibold", value === t.id ? "bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))]" : "bg-muted text-muted-foreground")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- States ---------- */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} data-testid="state-loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted/70" />
          </div>
        </div>
      ))}
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-destructive/20 bg-[hsl(352_80%_98.5%)] px-6 py-10 text-center" data-testid="state-error">
      <AlertTriangle className="h-5 w-5 text-destructive" strokeWidth={1.75} />
      <div className="mt-3 font-serif text-lg">This view didn't load</div>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{errMsg(error)}</p>
      {onRetry && <Btn size="sm" className="mt-4" onClick={onRetry} data-testid="button-retry"><RotateCw className="h-3.5 w-3.5" />Try again</Btn>}
    </div>
  );
}
export function EmptyState({ title, desc, action, icon }: { title: string; desc?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-secondary/50 px-6 py-10 text-center" data-testid="state-empty">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-[hsl(var(--brand-orange))]">{icon ?? <Inbox className="h-4 w-4" strokeWidth={1.75} />}</div>
      <div className="mt-3 font-serif text-lg">{title}</div>
      {desc && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- Form fields ---------- */
export const inputCls = "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 hover:border-foreground/25 focus:border-[hsl(var(--brand-orange))] focus:ring-[3px] focus:ring-[hsl(var(--brand-orange))]/15";
export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-foreground/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/* ---------- Confirm action ---------- */
export function ConfirmButton({
  label,
  icon,
  title,
  desc,
  confirmLabel = "Confirm",
  reason,
  reasonLabel = "Reason",
  onConfirm,
  pending,
  variant = "secondary",
  size = "sm",
  testid,
  disabled,
}: {
  label: string;
  icon?: ReactNode;
  title: string;
  desc?: string;
  confirmLabel?: string;
  reason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string, close: () => void) => void;
  pending?: boolean;
  variant?: BtnVariant;
  size?: "sm" | "md";
  testid?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const close = () => {
    setOpen(false);
    setText("");
  };
  return (
    <>
      <Btn variant={variant} size={size} onClick={() => setOpen(true)} data-testid={testid} disabled={disabled}>
        {icon}
        {label}
      </Btn>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {desc && <DialogDescription>{desc}</DialogDescription>}
          </DialogHeader>
          {reason && (
            <Field label={reasonLabel}>
              <textarea className={cn(inputCls, "h-20 py-2")} value={text} onChange={(e) => setText(e.target.value)} data-testid="input-reason" autoFocus />
            </Field>
          )}
          <DialogFooter>
            <Btn variant="ghost" onClick={close}>Cancel</Btn>
            <Btn
              variant={variant === "danger" ? "navy" : "primary"}
              disabled={pending || (reason && !text.trim())}
              onClick={() => onConfirm(text.trim(), close)}
              data-testid="button-confirm"
            >
              {pending ? "Working…" : confirmLabel}
            </Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------- Generic record dialog ---------- */
export type MetaField = { key: string; label: string; type?: "text" | "list" | "number" | "textarea" | "bool"; hint?: string };
export type BaseField = "patient" | "program" | "status" | "severity" | "assignee" | "date" | "value" | "unit" | "description";

export function RecordDialog({
  open,
  onOpenChange,
  kind,
  record,
  title,
  fields = ["status", "description"],
  meta = [],
  defaults = {},
  statusOptions,
  descLabel = "Description",
  titleLabel = "Title",
  overrideStatus,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: Kind;
  record?: CareRecord | null;
  title: string;
  fields?: BaseField[];
  meta?: MetaField[];
  defaults?: Partial<RecordInput>;
  statusOptions?: string[];
  descLabel?: string;
  titleLabel?: string;
  /** Forces the saved status (e.g. editing a signed plan must create a draft revision) */
  overrideStatus?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        {open && (
          <RecordForm
            kind={kind}
            record={record}
            title={title}
            fields={fields}
            meta={meta}
            defaults={defaults}
            statusOptions={statusOptions}
            descLabel={descLabel}
            titleLabel={titleLabel}
            overrideStatus={overrideStatus}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecordForm({ kind, record, title, fields, meta, defaults, statusOptions, descLabel, titleLabel, overrideStatus, onDone }: {
  overrideStatus?: string; kind: Kind; record?: CareRecord | null; title: string; fields: BaseField[]; meta: MetaField[]; defaults: Partial<RecordInput>; statusOptions?: string[]; descLabel: string; titleLabel: string; onDone: () => void;
}) {
  const base = { ...defaults, ...(record ?? {}) } as Partial<CareRecord>;
  const [v, setV] = useState({
    title: base.title ?? "",
    patientId: base.patientId ?? "",
    program: base.program ?? "",
    status: base.status ?? statusOptions?.[0] ?? "",
    severity: base.severity ?? "",
    assignee: base.assignee ?? "",
    date: (base.date ?? "").slice(0, 10),
    value: base.value === undefined || base.value === null ? "" : String(base.value),
    unit: base.unit ?? "",
    description: base.description ?? "",
  });
  const initialMeta: Record<string, string | boolean> = {};
  for (const f of meta) {
    const raw = base.metadata?.[f.key];
    if (f.type === "bool") initialMeta[f.key] = raw === true;
    else if (Array.isArray(raw)) initialMeta[f.key] = raw.join("\n");
    else initialMeta[f.key] = raw === undefined || raw === null ? "" : String(raw);
  }
  const [m, setM] = useState(initialMeta);
  const linked = kind === "staff" && record?.metadata?.identitySource === "staff_account";
  const LOCKED_META = ["role", "credential", "email", "npi", "location", "locationScopes", "siteRoles", "accountStatus", "userId"];
  const lockedMeta = (k: string) => linked && LOCKED_META.includes(k);
  const siteRoles = linked && record?.metadata?.siteRoles && typeof record.metadata.siteRoles === "object" ? Object.entries(record.metadata.siteRoles as Record<string, unknown>).filter(([, r]) => typeof r === "string" && r) as [string, string][] : [];
  const nice = (x: unknown) => (typeof x === "string" && x ? x.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "");
  const { save, pending } = useSaveRecord();
  const needPatients = fields.includes("patient");
  const patients = useListPatients(undefined, { query: { enabled: needPatients, queryKey: ["/api/patients"] } });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const metadata: Record<string, unknown> = { ...(record?.metadata ?? defaults.metadata ?? {}) };
    for (const f of meta) {
      if (lockedMeta(f.key)) continue; // identity fields managed through Staff accounts; keep originals untouched
      const val = m[f.key];
      if (f.type === "list") metadata[f.key] = String(val).split("\n").map((s) => s.trim()).filter(Boolean);
      else if (f.type === "number") metadata[f.key] = val === "" ? undefined : Number(val);
      else metadata[f.key] = val;
    }
    const data: RecordInput = {
      ...(defaults as RecordInput),
      title: linked && record ? record.title : v.title.trim(),
      metadata,
    };
    if (fields.includes("patient")) data.patientId = v.patientId || null;
    else if (record) data.patientId = record.patientId ?? null;
    if (fields.includes("program")) data.program = v.program || null;
    else if (record) data.program = record.program ?? null;
    if (linked && record) data.status = record.status;
    else if (fields.includes("status") && v.status) data.status = v.status;
    else if (record) data.status = record.status;
    if (fields.includes("severity") && v.severity) data.severity = v.severity;
    if (fields.includes("assignee")) data.assignee = v.assignee || undefined;
    if (fields.includes("date") && v.date) data.date = new Date(v.date + "T12:00:00").toISOString();
    if (fields.includes("value") && v.value !== "") data.value = Number(v.value);
    if (fields.includes("unit")) data.unit = v.unit || undefined;
    if (fields.includes("description")) data.description = v.description;
    if (overrideStatus) data.status = overrideStatus;
    save(kind, data, record?.id, onDone);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{record ? "Changes are audited." : "Creates a new entry. All changes are audited."}</DialogDescription>
      </DialogHeader>
      {linked && (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground" data-testid="note-linked-identity">
          Linked to a staff sign-in account. Name, role, credential, email, NPI, site roles and status are managed in Administration, Accounts, and shown read only here.
          {siteRoles.length > 0 ? (
            <div className="mt-2 space-y-0.5 text-foreground" data-testid="text-linked-site-roles">{siteRoles.map(([site, r]) => <div key={site}>{nice(r)} at {site}</div>)}</div>
          ) : nice(record?.metadata?.role) ? <div className="mt-2 text-foreground">{nice(record?.metadata?.role)}{Array.isArray(record?.metadata?.locationScopes) && (record?.metadata?.locationScopes as unknown[]).length ? ` at ${(record?.metadata?.locationScopes as string[]).join(", ")}` : ""}</div> : null}
          {nice(record?.metadata?.accountStatus) && <div className="mt-1">Account status: {nice(record?.metadata?.accountStatus)}</div>}
        </div>
      )}
      <Field label={titleLabel}>
        <input className={cn(inputCls, linked && "cursor-not-allowed bg-muted/50")} value={v.title} onChange={set("title")} readOnly={linked} required data-testid="input-title" autoFocus={!linked} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {fields.includes("patient") && (
          <Field label="Patient" className="col-span-2">
            <select className={inputCls} value={v.patientId} onChange={set("patientId")} data-testid="select-patient">
              <option value="">Not patient-specific</option>
              {(patients.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.lastName}, {p.firstName} · {p.mrn}</option>
              ))}
            </select>
          </Field>
        )}
        {fields.includes("program") && (
          <Field label="Program">
            <select className={inputCls} value={v.program} onChange={set("program")} data-testid="select-program">
              <option value="">None</option>
              {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        )}
        {fields.includes("status") && (
          <Field label="Status">
            {statusOptions ? (
              <select className={inputCls} value={v.status} onChange={set("status")} disabled={linked} data-testid="select-status">
                {statusOptions.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</option>)}
              </select>
            ) : (
              <input className={inputCls} value={v.status} onChange={set("status")} data-testid="input-status" />
            )}
          </Field>
        )}
        {fields.includes("severity") && (
          <Field label="Severity">
            <select className={inputCls} value={v.severity} onChange={set("severity")} data-testid="select-severity">
              <option value="">None</option>
              {["low", "medium", "high", "critical"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </Field>
        )}
        {fields.includes("assignee") && (
          <Field label="Assignee"><input className={inputCls} value={v.assignee} onChange={set("assignee")} data-testid="input-assignee" /></Field>
        )}
        {fields.includes("date") && (
          <Field label="Date"><input type="date" className={inputCls} value={v.date} onChange={set("date")} data-testid="input-date" /></Field>
        )}
        {fields.includes("value") && (
          <Field label="Value"><input type="number" step="any" className={inputCls} value={v.value} onChange={set("value")} data-testid="input-value" /></Field>
        )}
        {fields.includes("unit") && (
          <Field label="Unit"><input className={inputCls} value={v.unit} onChange={set("unit")} data-testid="input-unit" /></Field>
        )}
      </div>
      {fields.includes("description") && (
        <Field label={descLabel}>
          <textarea className={cn(inputCls, "h-24 py-2")} value={v.description} onChange={set("description")} data-testid="input-description" />
        </Field>
      )}
      {meta.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint ?? (f.type === "list" ? "One item per line" : undefined)}>
          {f.type === "bool" ? (
            <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={!!m[f.key]} onChange={(e) => setM((s) => ({ ...s, [f.key]: e.target.checked }))} data-testid={`input-meta-${f.key}`} />
          ) : f.type === "list" || f.type === "textarea" ? (
            <textarea className={cn(inputCls, "h-20 py-2")} value={String(m[f.key] ?? "")} onChange={(e) => setM((s) => ({ ...s, [f.key]: e.target.value }))} data-testid={`input-meta-${f.key}`} />
          ) : (
            <input type={f.type === "number" ? "number" : "text"} className={cn(inputCls, lockedMeta(f.key) && "cursor-not-allowed bg-muted/50")} value={lockedMeta(f.key) && f.key === "role" && siteRoles.length ? "Varies by site (see above)" : String(m[f.key] ?? "")} readOnly={lockedMeta(f.key)} onChange={(e) => setM((s) => ({ ...s, [f.key]: e.target.value }))} data-testid={`input-meta-${f.key}`} />
          )}
        </Field>
      ))}
      <DialogFooter>
        <Btn type="button" variant="ghost" onClick={onDone}>Cancel</Btn>
        <Btn type="submit" variant="primary" disabled={pending || !v.title.trim()} data-testid="button-save-record">{pending ? "Saving…" : record ? "Save changes" : "Create"}</Btn>
      </DialogFooter>
    </form>
  );
}

/** Small inline controller hook for record dialogs */
export function useRecordDialog() {
  const [state, setState] = useState<{ open: boolean; record: CareRecord | null }>({ open: false, record: null });
  return {
    open: state.open,
    record: state.record,
    create: () => setState({ open: true, record: null }),
    edit: (r: CareRecord) => setState({ open: true, record: r }),
    onOpenChange: (o: boolean) => setState((s) => ({ ...s, open: o })),
  };
}

export function IconBtn({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...props} aria-label={label} title={label} className={cn("inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", props.className)}>
      {children}
    </button>
  );
}

