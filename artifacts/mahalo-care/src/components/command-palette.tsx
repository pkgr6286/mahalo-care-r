import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, CornerDownLeft, Search, UserRound } from "lucide-react";
import { useListPatients, getListPatientsQueryKey, type User } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { can } from "@/components/access";
import { errMsg } from "@/lib/api";
import { cn } from "@/lib/utils";

export type PaletteNav = { href: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; perms?: string[] };
type Item = { id: string; href: string; label: string; hint: string; kind: "patient" | "page"; icon: PaletteNav["icon"] };

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Search button. Opens the single shell-owned palette. */
export function SearchTrigger({ onOpen, compact }: { onOpen: () => void; compact?: boolean }) {
  return compact ? (
    <button onClick={onOpen} aria-label="Search patients and pages" aria-haspopup="dialog" className="rounded-full p-1.5 hover:bg-secondary" data-testid="button-search-mobile"><Search className="h-5 w-5" strokeWidth={1.5} /></button>
  ) : (
    <button onClick={onOpen} aria-haspopup="dialog" aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"} className="group flex h-9 w-full items-center gap-2 rounded-full border border-sidebar-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-orange))]/50" data-testid="button-search">
      <Search className="h-4 w-4" strokeWidth={1.6} /><span className="flex-1 text-left">Search</span>
      <kbd className="rounded border border-border bg-secondary px-1.5 font-mono text-[10px] text-muted-foreground">{isMac ? "\u2318" : "Ctrl"} K</kbd>
    </button>
  );
}

/** The one command palette for the staff shell: owns the Cmd/Ctrl+K listener and the dialog. Mount only in the staff shell. */
export function CommandPalette({ user, nav, open, onOpenChange }: { user: User; nav: PaletteNav[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const toggleRef = useRef(onOpenChange);
  toggleRef.current = onOpenChange;
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); toggleRef.current(!openRef.current); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return open ? <PaletteDialog user={user} nav={nav} onClose={() => onOpenChange(false)} /> : null;
}

function PaletteDialog({ user, nav, onClose }: { user: User; nav: PaletteNav[]; onClose: () => void }) {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  const canPatients = can(user, "admin", "patients.read");
  const search = debounced.length >= 2 && canPatients ? debounced : "";
  const pts = useListPatients({ search }, { query: { enabled: !!search, queryKey: getListPatientsQueryKey({ search }), staleTime: 15_000 } });
  const typing = canPatients && q.trim().length >= 2 && (q.trim() !== debounced || pts.isFetching);

  const pages = useMemo(() => {
    const s = q.trim().toLowerCase();
    return nav.filter((n) => !n.perms || can(user, ...n.perms)).filter((n) => !s || n.label.toLowerCase().includes(s))
      .map<Item>((n) => ({ id: "page-" + n.href, href: n.href, label: n.label, hint: "Page", kind: "page", icon: n.icon }));
  }, [nav, user, q]);
  const patients = useMemo<Item[]>(() => (search ? (pts.data ?? []).slice(0, 8).map((p) => ({ id: "pt-" + p.id, href: "/patients/" + p.id, label: [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unnamed patient", hint: "MRN " + p.mrn, kind: "patient", icon: UserRound })) : []), [pts.data, search]);
  const items = [...patients, ...pages];
  useEffect(() => setActive(0), [q, patients.length]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" }); }, [active]);

  const go = (it?: Item) => { if (!it) return; onClose(); navigate(it.href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (items.length ? (a + 1) % items.length : 0)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(Math.max(0, items.length - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(items[active]); }
  };
  const optId = (i: number) => baseId + "-opt-" + i;
  const listId = baseId + "-list";

  const section = (title: string, list: Item[], offset: number) => list.length > 0 && (
    <li role="presentation">
      <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground" aria-hidden="true">{title}</div>
      <ul role="group" aria-label={title}>
        {list.map((it, i) => {
          const idx = offset + i;
          const on = idx === active;
          return (
            <li key={it.id} id={optId(idx)} role="option" aria-selected={on} data-active={on} onMouseMove={() => setActive(idx)} onClick={() => go(it)}
              className={cn("mx-2 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors", on ? "bg-[hsl(var(--brand-charcoal))] text-[hsl(var(--background))]" : "text-foreground")} data-testid={"palette-" + it.id}>
              <it.icon className={cn("h-4 w-4 shrink-0", on ? "opacity-90" : "text-muted-foreground")} strokeWidth={1.6} />
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              <span className={cn("shrink-0 font-mono text-[11px]", on ? "opacity-70" : "text-muted-foreground")}>{it.hint}</span>
              {on ? <CornerDownLeft className="h-3.5 w-3.5 opacity-70" strokeWidth={1.6} /> : <ArrowRight className="h-3.5 w-3.5 opacity-0" strokeWidth={1.6} />}
            </li>
          );
        })}
      </ul>
    </li>
  );

  let status: React.ReactNode = null;
  if (canPatients && q.trim().length > 0 && q.trim().length < 2) status = "Type at least 2 characters to search patients.";
  else if (typing) status = <span className="flex flex-col gap-1.5" aria-label="Searching patients">{[0, 1].map((i) => <span key={i} className="h-3 w-2/3 animate-pulse rounded bg-muted" />)}</span>;
  else if (search && pts.isError) status = <span className="text-destructive">Patient search failed: {errMsg(pts.error)} <button className="underline underline-offset-2" onClick={() => pts.refetch()}>Retry</button></span>;
  else if (search && !patients.length) status = "No patients in your scope match \u201c" + search + "\u201d.";
  else if (!canPatients && q.trim()) status = "Patient search needs patient access; showing pages only.";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="top-[12vh] max-w-xl translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 [&>button]:hidden" onKeyDown={onKey}>
        <DialogTitle className="sr-only">Search patients and pages</DialogTitle>
        <DialogDescription className="sr-only">Type a patient name or MRN, or a page name. Use arrow keys to move and Enter to open.</DialogDescription>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={canPatients ? "Patient name, MRN or page" : "Page name"}
            role="combobox" aria-expanded aria-controls={listId} aria-autocomplete="list" aria-activedescendant={items[active] ? optId(active) : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" data-testid="input-command-palette" />
          <kbd className="hidden rounded border border-border bg-secondary px-1.5 font-mono text-[10px] text-muted-foreground sm:inline">Esc</kbd>
        </div>
        <ul id={listId} ref={listRef} role="listbox" aria-label="Results" className="max-h-[min(60vh,420px)] overflow-y-auto pb-2">
          {section("Patients", patients, 0)}
          {status && <li role="presentation" className="px-4 pt-3 text-xs text-muted-foreground" aria-live="polite">{status}</li>}
          {section("Pages", pages, patients.length)}
          {!pages.length && !patients.length && !status && <li role="presentation" className="px-4 py-6 text-center text-sm text-muted-foreground">No matches.</li>}
        </ul>
        <div className="flex items-center gap-3 border-t border-border bg-secondary/40 px-4 py-2 text-[11px] text-muted-foreground">
          <span>Arrows to move</span><span>Enter to open</span><span className="ml-auto">Names and MRNs only, within your access scope</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
