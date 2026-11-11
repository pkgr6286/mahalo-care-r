import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useGetSettings, useListRecords, usePerformAction, type ActionResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Btn, ConfirmButton, EmptyState, Field, Panel, inputCls } from "@/components/kit";
import { errMsg } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { checkedSheet, csvSheet, guessColumns, importFields, importTemplate, mappedCsv, mappedRows, readRoster, type ImportDefaults, type ImportField, type ImportMapping, type ImportSheet } from "@/lib/patient-import";

export function PatientImport({ onClose }: { onClose?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const settings = useGetSettings();
  const locations = useListRecords("locations");
  const staff = useListRecords("staff");
  const [sheets, setSheets] = useState<ImportSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [defaults, setDefaults] = useState<ImportDefaults>({});
  const [paste, setPaste] = useState("");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [report, setReport] = useState<{ csv: string; result: ActionResult } | null>(null);
  // Hook-level callbacks also refresh other screens if the user leaves during an import.
  const mutation = usePerformAction({ mutation: {
    onSuccess: (result, variables) => {
      qc.invalidateQueries();
      const csv = variables.data.payload?.csv;
      const meta = result.record?.metadata ?? {};
      if (typeof csv !== "string" || typeof meta.dryRun !== "boolean" || !Array.isArray(meta.errors) || ["rowCount","validRows","newRows","duplicateRows","imported"].some(key=>typeof meta[key]!=="number")) {
        const message = "The server returned an unexpected import result. Check the patient panel before retrying.";
        setReport(null); setError(message);
        toast({ title: "Import result needs review", description: message, variant: "destructive" });
        return;
      }
      setReport({ csv, result });
      const errors = Array.isArray(meta.errors) ? meta.errors.length : 0;
      const dryRun = variables.data.payload?.dryRun !== false;
      toast({
        title: errors ? "Roster needs correction" : !result.success ? "Import not completed" : dryRun ? "Roster validated" : `${meta.imported} patients added`,
        description: result.record?.description || result.message,
        variant: errors || !result.success ? "destructive" : undefined,
      });
    },
    onError: e => {
      setReport(null); setError(errMsg(e));
      toast({ title: "Import not completed", description: errMsg(e), variant: "destructive" });
    },
  } });
  const pending = mutation.isPending;
  const fileGeneration = useRef(0);
  const sites = (locations.data ?? []).filter(s => s.status === "active");
  const managers = (staff.data ?? []).filter(s => s.status === "active");
  const sheet = sheets[sheetIndex];
  const resolvedDefaults = { ...defaults, timezone: defaults.timezone || settings.data?.timezone || "America/New_York" };
  const prepared = useMemo(() => {
    if (!sheet) return null;
    try {
      const checked = checkedSheet(sheet);
      return { rows: mappedRows(checked, mapping, resolvedDefaults), csv: mappedCsv(checked, mapping, resolvedDefaults), error: "" };
    } catch (e) { return { rows: [], csv: "", error: errMsg(e) }; }
  }, [sheet, mapping, defaults, settings.data?.timezone]);
  const meta = (report?.result.record?.metadata ?? {}) as Record<string, unknown>;
  const n = (key: string) => typeof meta[key] === "number" ? meta[key] as number : 0;
  const errors = Array.isArray(meta.errors) ? meta.errors as { row: number; message: string }[] : [];
  const duplicates = Array.isArray(meta.duplicates) ? meta.duplicates as { row: number; message: string }[] : [];
  const same = !!prepared?.csv && report?.csv === prepared.csv;
  const validated = same && meta.dryRun === true && errors.length === 0 && n("newRows") > 0;
  const completed = same && meta.dryRun === false;
  const ignored = sheet?.rows[0].map((header, index) => ({ header: String(header || `Column ${index + 1}`), index })).filter(c => !Object.values(mapping).includes(c.index)) ?? [];
  const choose = (all: ImportSheet[], index: number) => {
    setSheets(all); setSheetIndex(index); setMapping(guessColumns(all[index])); setReport(null); setError("");
  };
  const onFile = async (file?: File) => {
    const generation = ++fileGeneration.current;
    setSheets([]); setReport(null); setError(""); setConfirmed(false);
    if (!file) return;
    setLoading(true); setFilename(file.name);
    try {
      const all = await readRoster(file);
      if (generation !== fileGeneration.current) return;
      const firstRoster = all.findIndex(s => s.rows.length > 1 && Object.keys(guessColumns(s)).length > 1);
      choose(all, firstRoster >= 0 ? firstRoster : 0);
    } catch (e) { if (generation === fileGeneration.current) setError(errMsg(e)); }
    finally { if (generation === fileGeneration.current) setLoading(false); }
  };
  const match = (key: ImportField, value: string) => setMapping(old => {
    const next = { ...old };
    if (value === "") delete next[key]; else next[key] = Number(value);
    return next;
  });
  const exec = (dryRun: boolean) => {
    if (!prepared?.csv || !confirmed) return;
    const csv = prepared.csv;
    setError("");
    mutation.mutate({ data: { action: "importPatients", payload: { csv, dryRun, syntheticConfirmed: confirmed } } });
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([importTemplate], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "mahalo-patient-import.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const matchField = (field: (typeof importFields)[number]) => (
    <Field key={field.key} label={`${field.label}${"required" in field ? " *" : ""}`}>
      <select className={inputCls} value={mapping[field.key] ?? ""} onChange={e => match(field.key, e.target.value)} disabled={pending || completed} data-testid={`match-import-${field.key}`}>
        <option value="">{"required" in field ? field.key === "location" && defaults.location ? "Use default location" : "Choose a column" : "Not imported / use default"}</option>
        {sheet?.rows[0].map((cell, index) => <option key={index} value={index}>{String(cell ?? "Untitled")} · column {index + 1}</option>)}
      </select>
    </Field>
  );
  return (
    <Panel title="Import patients" sub="Add a roster from Excel or CSV. Review and validate before anything is created." className="mt-5" action={<Btn size="sm" onClick={downloadTemplate}><Download className="h-3.5 w-3.5" />CSV template</Btn>}>
      <ol className="mb-5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        {["Choose a file", "Match and preview", "Validate and import"].map((label, i) => <li key={label} className={(i === 0 || (sheet && i === 1) || (report && i === 2)) ? "font-medium text-foreground" : ""}>{i + 1}. {label}</li>)}
      </ol>
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-input bg-secondary/40 p-4 hover:bg-secondary/70">
          <span className="flex items-center gap-2 text-sm font-medium"><FileSpreadsheet className="h-4 w-4" />{loading ? "Reading spreadsheet…" : filename || "Choose an Excel or CSV roster"}</span>
          <span className="text-xs text-muted-foreground">.xlsx or .csv · up to 500 patients · file under 1 MiB</span>
          <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={pending || loading} onChange={e => void onFile(e.target.files?.[0])} className="block text-xs file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5" data-testid="input-import-file" />
        </label>
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground">Or paste CSV</summary>
          <textarea className={`${inputCls} mt-2 h-28 py-2 font-mono text-xs`} value={paste} onChange={e => setPaste(e.target.value)} placeholder="firstName,lastName,dob,location" disabled={pending} data-testid="input-import-csv" />
          <Btn size="sm" className="mt-2" disabled={!paste.trim() || pending || loading} onClick={() => {
            try { choose([csvSheet(paste)], 0); setFilename("Pasted CSV"); setConfirmed(false); }
            catch (e) { setSheets([]); setReport(null); setError(errMsg(e)); }
          }}>Load pasted CSV</Btn>
        </details>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {sheet && <>
          {sheets.length > 1 && <Field label="Worksheet"><select className={inputCls} value={sheetIndex} disabled={pending} onChange={e => choose(sheets, Number(e.target.value))} data-testid="select-import-sheet">{sheets.map((s, index) => <option key={index} value={index}>{s.name}</option>)}</select></Field>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{importFields.slice(0, 4).map(matchField)}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Default location for blank or unmatched cells"><select className={inputCls} value={defaults.location ?? ""} disabled={pending || completed} onChange={e => setDefaults(v => ({ ...v, location: e.target.value }))} data-testid="default-import-location"><option value="">Choose if needed</option>{sites.map(s => <option key={s.id}>{s.title}</option>)}</select></Field>
            <Field label="Default care manager for unassigned rows"><select className={inputCls} value={defaults.careManager ?? ""} disabled={pending || completed} onChange={e => setDefaults(v => ({ ...v, careManager: e.target.value }))}><option value="">Unassigned</option>{managers.map(s => <option key={s.id}>{s.title}</option>)}</select></Field>
          </div>
          <details className="rounded-lg border border-border p-3 text-xs"><summary className="cursor-pointer font-medium">Optional fields · {importFields.slice(4).filter(f => mapping[f.key] !== undefined).length} matched</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{importFields.slice(4).map(matchField)}</div><p className="mt-3 text-muted-foreground">Use YYYY-MM-DD or Excel date cells for birth dates. Format MRNs and phone numbers as text. Separate summary conditions or medications with |. Patient timezone defaults to {resolvedDefaults.timezone}. Summaries do not create verified coded diagnoses or reconciled prescriptions.</p></details>
          {ignored.length > 0 && <p className="text-xs text-muted-foreground" data-testid="text-import-ignored">Not imported: {ignored.map(c => c.header).join(", ")}. Match any needed column above before continuing.</p>}
          {prepared?.error ? <p className="text-sm text-destructive" role="alert">{prepared.error}</p> : prepared && <>
            <div data-testid="preview-import">
              <p className="mb-2 text-xs font-medium">{prepared.rows.length} patients · previewing the first {Math.min(5, prepared.rows.length)}</p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs"><thead className="bg-secondary"><tr>{["Patient", "Date of birth", "Location", "MRN"].map(h => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}</tr></thead><tbody>{prepared.rows.slice(0, 5).map((row, i) => <tr key={i} className="border-t border-border"><td className="px-3 py-2">{row.firstName} {row.lastName}</td><td className="px-3 py-2">{row.dob}</td><td className="px-3 py-2">{row.location}</td><td className="px-3 py-2">{row.mrn || "Assigned on import"}</td></tr>)}</tbody></table>
              </div>
            </div>
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} disabled={pending || completed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" data-testid="checkbox-synthetic" />This file contains only fictional patients, with no real patient information.</label>
            <div className="flex flex-wrap gap-2">
              <Btn disabled={!confirmed || pending || completed} onClick={() => exec(true)} data-testid="button-validate-import">Validate roster</Btn>
              <ConfirmButton size="md" variant="primary" label="Import patients" icon={<Upload className="h-4 w-4" />} title="Import validated patients?" desc={`Adds ${n("newRows")} patients and skips ${n("duplicateRows")} duplicates. Existing patients are not changed. Enrollment and consent are completed separately.`} confirmLabel="Import patients" pending={pending} disabled={!validated || !confirmed} onConfirm={(_, close) => { exec(false); close(); }} testid="button-run-import" />
            </div>
          </>}
        </>}
        {report && <div className="rounded-xl border border-border bg-secondary/40 p-4" data-testid="panel-import-report" aria-live="polite">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">{completed && <CheckCircle2 className="h-4 w-4 text-[hsl(162_60%_30%)]" />}{completed ? `${n("imported")} patients added` : errors.length ? "Correct the rows below" : validated ? "Ready to import" : "Validation results"}</p>
          <div className="grid grid-cols-4 gap-2 text-center">{[["Rows", "rowCount"], ["Valid", "validRows"], ["New", "newRows"], ["Duplicates", "duplicateRows"]].map(([label, key]) => <div key={key}><div className="tnum text-xl font-semibold">{n(key)}</div><div className="text-[11px] text-muted-foreground">{label}</div></div>)}</div>
          {errors.length > 0 && <div className="mt-3 max-h-48 overflow-auto">{errors.map((e, i) => <p key={i} className="text-xs text-destructive">Row {e.row}: {e.message}</p>)}</div>}
          {duplicates.length > 0 && <details className="mt-3 text-xs"><summary className="cursor-pointer font-medium">Review skipped duplicates</summary>{duplicates.map((d, i) => <p key={i} className="mt-1 text-muted-foreground">Row {d.row}: {d.message}</p>)}</details>}
          {!same && <p className="mt-3 text-xs text-[hsl(30_80%_38%)]">The roster or matching changed. Validate again before importing.</p>}
          {completed && <div className="mt-3 space-y-3"><p className="text-xs text-muted-foreground">Patients are in the panel. Next, verify each chart and enroll the patient in the appropriate program. This import did not create accounts, consent, enrollments or billable time.</p>{onClose ? <Btn onClick={onClose}>Done</Btn> : <Link href="/patients" className="text-sm font-medium underline underline-offset-4">Open patient panel</Link>}</div>}
        </div>}
        {!sheet && !loading && <EmptyState title="Start with your patient roster" desc="Required: first name, last name, birth date and practice location. An administrator imports the roster; clinicians then review and enroll patients." />}
      </div>
    </Panel>
  );
}
