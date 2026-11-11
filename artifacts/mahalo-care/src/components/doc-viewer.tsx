import { useEffect, useState } from "react";
import { FileDown } from "lucide-react";
import { useDownloadDocument, getDownloadDocumentQueryKey, type CareRecord } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, ErrorState } from "@/components/kit";
import { HistoryButton } from "@/components/document-history";
import { isRetainedDocument } from "@/lib/record-lifecycle";

/** Only these record kinds have a generated PDF on the backend. */
export const DOCUMENT_KINDS = ["careplans", "notes", "consents", "billing"] as const;
export function hasDocument(r: CareRecord) {
  return (DOCUMENT_KINDS as readonly string[]).includes(r.kind);
}

export function DocButton({ r, label = "PDF", history = true }: { r: CareRecord; label?: string; history?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!hasDocument(r)) return null;
  return (
    <>
      <Btn size="sm" onClick={() => setOpen(true)} data-testid={`button-doc-${r.id}`}><FileDown className="h-3.5 w-3.5" />{label}</Btn>
      {open && <DocViewer record={r} onClose={() => setOpen(false)} />}
      {history && <HistoryButton r={r} />}
    </>
  );
}

function DocViewer({ record, onClose }: { record: CareRecord; onClose: () => void }) {
  const doc = useDownloadDocument(record.id, { query: { enabled: hasDocument(record), queryKey: [...getDownloadDocumentQueryKey(record.id), record.updatedAt, record.status, record.metadata?.closed] } });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!doc.data) return;
    const u = URL.createObjectURL(doc.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [doc.data]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{record.title}</DialogTitle><DialogDescription>{!isRetainedDocument(record) ? "Unretained preview. In its current state this record is not retained, so this PDF is regenerated on each view and not stored." : "Retained PDF from the local database. Older records store a labelled legacy capture on first download. Synthetic data, not for clinical use."}</DialogDescription></DialogHeader>
        {doc.isLoading ? <div className="h-[60dvh] animate-pulse rounded bg-muted" /> : doc.isError ? <ErrorState error={doc.error} onRetry={() => doc.refetch()} /> : url ? (
          <iframe src={url} title={record.title} className="h-[60dvh] w-full rounded-md border border-border" data-testid="frame-document" />
        ) : null}
        <DialogFooter>
          <a href={`/api/documents/${record.id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-white" data-testid="link-download-document"><FileDown className="h-4 w-4" />Download PDF</a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
