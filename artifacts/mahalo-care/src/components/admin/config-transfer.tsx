import { useState } from "react";
import { Download, Upload } from "lucide-react";
import type { ActionResult } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Field, Panel, inputCls } from "@/components/kit";
import { useAction } from "@/lib/api";

export function ConfigTransferPanel() {
  const { run, pending } = useAction();
  const [json, setJson] = useState("");
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const begin = () => {
    try { JSON.parse(json); setParseErr(null); setConfirm(false); setOpen(true); }
    catch { setParseErr("Not valid JSON. Paste a file exported from Mahalo Care."); }
  };
  const doImport = () => run({ action: "importConfiguration", payload: JSON.parse(json) }, (r) => { setResult(r); setJson(""); setOpen(false); }, { always: true });
  return (
    <Panel title="Configuration backup" sub="Reference records and versioned policies">
      <a href="/api/exports/configuration" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-input px-3.5 text-sm font-medium hover:bg-muted" data-testid="link-export-config"><Download className="h-4 w-4" strokeWidth={1.6} />Export backup</a>
      <p className="mt-2 text-[11px] text-muted-foreground">Includes references and versioned policies (with bundled baselines) and a SHA-256 checksum. No secrets, accounts or patient data. The checksum detects accidental changes; it does not prove who made the file.</p>
      <Field label="Import backup JSON" className="mt-4"><textarea className={inputCls + " h-32 py-2 font-mono text-xs"} value={json} onChange={(e) => { setJson(e.target.value); setParseErr(null); }} data-testid="input-import-json" /></Field>
      {parseErr && <p role="alert" className="mt-1 text-xs text-destructive">{parseErr}</p>}
      <Btn className="mt-2" disabled={!json.trim() || pending} onClick={begin} data-testid="button-import"><Upload className="h-4 w-4" strokeWidth={1.6} />Import as drafts</Btn>
      {result && <div role="status" className={"mt-3 rounded-lg border px-3 py-2 text-xs " + (result.success ? "border-border bg-muted/40" : "border-destructive/25 text-destructive")} data-testid="text-import-result">{result.message}</div>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import configuration as drafts</DialogTitle>
            <DialogDescription>Nothing existing is overwritten or activated.</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/85">
            <li>Every reference and policy is cloned as a new draft; existing records are left unchanged.</li>
            <li>Review and approval from the source practice are cleared. Published status is never restored.</li>
            <li>Payer overrides are linked to local base policies. Review and publish those base policies here before the imported overrides can be reviewed.</li>
            <li>Older v1 files (references only) are still accepted.</li>
          </ul>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="check-import-confirm" />I understand imported items are drafts that need local review.</label>
          <DialogFooter>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" disabled={!confirm || pending} onClick={doImport} data-testid="button-confirm-import">{pending ? "Importing…" : "Import drafts"}</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
