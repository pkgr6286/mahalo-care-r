import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/** Client-side pagination over an already-loaded list. Resets to page 1 when the list identity/length changes. */
export function usePaged<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { setPage(1); }, [total]);
  const current = Math.min(page, pages);
  const slice = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize]);
  return { page: current, pages, total, pageSize, slice, setPage };
}

export function Pager({ page, pages, total, pageSize, setPage, noun = "items", className, testid = "pager" }: { page: number; pages: number; total: number; pageSize: number; setPage: (p: number) => void; noun?: string; className?: string; testid?: string }) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={cn("flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground", className)} data-testid={testid}>
      <span className="tnum">{from}–{to} of {total} {noun}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input bg-card transition-colors hover:bg-muted disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page" data-testid={`${testid}-prev`}><ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} /></button>
        <span className="tnum min-w-[3.5rem] text-center">{page} / {pages}</span>
        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input bg-card transition-colors hover:bg-muted disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page" data-testid={`${testid}-next`}><ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} /></button>
      </div>
    </div>
  );
}

/** Progressive "show more" for feeds where paging feels wrong (timelines, activity). */
export function useShowMore<T>(items: T[], step = 15) {
  const [n, setN] = useState(step);
  useEffect(() => { setN(step); }, [items.length, step]);
  return { visible: items.slice(0, n), hasMore: items.length > n, remaining: Math.max(0, items.length - n), more: () => setN((x) => x + step) };
}

export function ShowMore({ hasMore, remaining, more, noun = "more", testid = "button-show-more" }: { hasMore: boolean; remaining: number; more: () => void; noun?: string; testid?: string }) {
  if (!hasMore) return null;
  return (
    <button type="button" onClick={more} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground" data-testid={testid}>
      <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />Show {Math.min(remaining, 15)} {noun} <span className="tnum text-muted-foreground/70">({remaining} remaining)</span>
    </button>
  );
}

/** Explicit disclosure for technical/audit detail. Closed by default. */
export function AdvancedDetails({ label = "Technical details", children, className, testid = "details-advanced" }: { label?: string; children: ReactNode; className?: string; testid?: string }) {
  return (
    <details className={cn("group rounded-lg border border-border bg-muted/30 text-xs", className)} data-testid={testid}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-muted-foreground hover:text-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.6} />{label}
        <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" strokeWidth={1.6} />
      </summary>
      <div className="border-t border-border px-3 py-2">{children}</div>
    </details>
  );
}

/** Small labelled key/value used in summaries. */
export function KV({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

/** Render-prop paginated list; safe to drop into conditional branches. */
export function PagedList<T>({ items, pageSize = 20, noun, render, testid, pagerClassName }: { items: T[]; pageSize?: number; noun?: string; render: (item: T) => ReactNode; testid?: string; pagerClassName?: string }) {
  const pg = usePaged(items, pageSize);
  return <>{pg.slice.map(render)}<Pager {...pg} noun={noun} testid={testid} className={pagerClassName} /></>;
}
