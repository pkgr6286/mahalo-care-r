import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Send } from "lucide-react";
import { useListRecords } from "@workspace/api-client-react";
import { Btn, EmptyState, ErrorState, PageHeader, SkeletonRows, inputCls } from "@/components/kit";
import { fmtDateTime, fmtRel, initials, mStr, useSaveRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function MessagesPage() {
  const q = useListRecords("messages");
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const { save, pending } = useSaveRecord();
  const threads = useMemo(() => {
    const m = new Map<string, { id: string; name: string; items: NonNullable<typeof q.data> }>();
    for (const r of q.data ?? []) {
      const k = r.patientId ?? "general";
      if (!m.has(k)) m.set(k, { id: k, name: r.patientName || "General", items: [] });
      m.get(k)!.items.push(r);
    }
    return [...m.values()].map((t) => ({ ...t, items: t.items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) })).sort((a, b) => b.items[b.items.length - 1].createdAt.localeCompare(a.items[a.items.length - 1].createdAt));
  }, [q.data]);
  const active = threads.find((t) => t.id === sel) ?? threads[0];
  const send = () => {
    if (!active || !text.trim()) return;
    save("messages", { title: text.trim().slice(0, 60), description: text.trim(), patientId: active.id === "general" ? null : active.id, status: "sent", metadata: { direction: "outbound", channel: "secure" } }, undefined, () => setText(""));
  };
  return (
    <div>
      <PageHeader eyebrow="Messages" title="Patient conversations" desc="Secure messages from the patient app. Delivery to phones is simulated in this demo." />
      {q.isLoading ? <SkeletonRows rows={6} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !threads.length ? <EmptyState title="No conversations yet" /> : (
        <div className="rise grid overflow-hidden rounded-xl border border-card-border bg-card md:grid-cols-[300px_1fr]">
          <div className="max-h-[620px] overflow-y-auto border-b border-border md:border-b-0 md:border-r">
            {threads.map((t) => {
              const last = t.items[t.items.length - 1];
              const unread = mStr(last, "direction") === "inbound" && last.status !== "read";
              return (
                <button key={t.id} onClick={() => setSel(t.id)} className={cn("flex w-full gap-3 border-b border-border px-4 py-3 text-left last:border-b-0", active?.id === t.id ? "bg-accent/60" : "hover:bg-muted/50")} data-testid={`thread-${t.id}`}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold">{initials(t.name)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between"><span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{t.name}</span><span className="text-[10px] text-muted-foreground">{fmtRel(last.createdAt)}</span></div>
                    <div className="truncate text-xs text-muted-foreground">{last.description || last.title}</div>
                  </div>
                  {unread && <span className="mt-2 h-2 w-2 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>
          {active && (
            <div className="flex min-h-[460px] flex-col">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-semibold">{active.name}</span>
                {active.id !== "general" && <Link href={`/patients/${active.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary" data-testid="link-thread-patient">Open chart <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-4">
                {active.items.map((m) => {
                  const out = mStr(m, "direction") !== "inbound";
                  return (
                    <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm", out ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm border border-border bg-card")}>
                        <div className="whitespace-pre-wrap">{m.description || m.title}</div>
                        <div className={cn("mt-0.5 text-[10px]", out ? "text-white/70" : "text-muted-foreground")}>{fmtDateTime(m.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 border-t border-border p-3">
                <input className={inputCls} placeholder="Write a reply" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} data-testid="input-reply" />
                <Btn variant="primary" disabled={pending || !text.trim()} onClick={send} data-testid="button-send-reply"><Send className="h-3.5 w-3.5" />Send</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
