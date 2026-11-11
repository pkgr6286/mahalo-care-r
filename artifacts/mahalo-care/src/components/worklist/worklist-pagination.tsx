import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES } from "@/lib/worklist";
import { cn } from "@/lib/utils";

export function WorklistPagination({ page, totalPages, total, pageSize, onPage, onSize, disabled }: { page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void; onSize: (n: number) => void; disabled?: boolean }) {
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const btn = "inline-flex h-8 w-8 items-center justify-center rounded-full border border-input bg-card text-foreground/70 hover:bg-secondary disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center gap-3 px-1 pt-3 text-xs text-muted-foreground" data-testid="worklist-pagination">
      <span className="tnum" data-testid="text-wl-range">{from}–{to} of {total}</span>
      <label className="flex items-center gap-1.5">Rows
        <select className="h-8 rounded-lg border border-input bg-card px-2 text-xs" value={pageSize} onChange={(e) => onSize(Number(e.target.value))} data-testid="select-wl-pagesize">
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <span className="ml-auto flex items-center gap-1.5">
        <button type="button" className={btn} disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" data-testid="button-wl-prev"><ChevronLeft className="h-4 w-4" strokeWidth={1.6} /></button>
        <span className={cn("tnum px-1")}>Page {page} of {Math.max(1, totalPages)}</span>
        <button type="button" className={btn} disabled={disabled || page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page" data-testid="button-wl-next"><ChevronRight className="h-4 w-4" strokeWidth={1.6} /></button>
      </span>
    </div>
  );
}
