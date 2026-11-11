import { parse } from "csv-parse/browser/esm/sync";

export const importFields = [
  { key: "firstName", label: "First name", required: true, aliases: ["firstname", "givenname"] },
  { key: "lastName", label: "Last name", required: true, aliases: ["lastname", "surname", "familyname"] },
  { key: "dob", label: "Date of birth", required: true, aliases: ["dob", "dateofbirth", "birthdate"] },
  { key: "location", label: "Location", required: true, aliases: ["location", "site", "clinic"] },
  { key: "mrn", label: "Medical record number", aliases: ["mrn", "medicalrecordnumber"] },
  { key: "email", label: "Email", aliases: ["email", "emailaddress"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phonenumber", "mobile", "mobilephone"] },
  { key: "sex", label: "Sex", aliases: ["sex", "gender"] },
  { key: "conditions", label: "Condition summary", aliases: ["conditions", "diagnoses", "condition"] },
  { key: "medications", label: "Medication summary", aliases: ["medications", "medication"] },
  { key: "payer", label: "Payer", aliases: ["payer", "insurance", "primaryinsurance"] },
  { key: "careManager", label: "Care manager", aliases: ["caremanager", "assignedcaremanager"] },
  { key: "timezone", label: "Patient timezone", aliases: ["timezone", "patienttimezone"] },
] as const;

export type ImportField = (typeof importFields)[number]["key"];
export type ImportCell = string | number | boolean | Date | null;
export type ImportSheet = { name: string; rows: ImportCell[][] };
export type ImportMapping = Partial<Record<ImportField, number>>;
export type ImportDefaults = Partial<Record<ImportField, string>>;
export const importTemplate = importFields.map(f => f.key).join(",") + "\r\n";

export function csvSheet(csv: string): ImportSheet {
  const rows = parse(csv, { bom: true, skip_empty_lines: true, relax_column_count: false }) as string[][];
  return checkedSheet({ name: "CSV", rows });
}

export function checkedSheet(sheet: ImportSheet): ImportSheet {
  const rows = sheet.rows.filter(row => row.some(cell => cell !== null && String(cell).trim() !== ""));
  if (rows.length < 2) throw new Error("Add a header row and at least one patient row.");
  if (rows.length > 501) throw new Error("Import up to 500 patients at a time. Split this sheet into smaller files.");
  if (rows[0].length > 60) throw new Error("Use a roster with no more than 60 columns.");
  return { ...sheet, rows };
}

export function guessColumns(sheet: ImportSheet): ImportMapping {
  const headers = sheet.rows[0].map(cell => String(cell ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""));
  return Object.fromEntries(importFields.flatMap(f => {
    const index = headers.findIndex(header => (f.aliases as readonly string[]).includes(header));
    return index < 0 ? [] : [[f.key, index]];
  }));
}

export function cellText(cell: ImportCell | undefined): string {
  if (cell instanceof Date) {
    if (!Number.isFinite(cell.getTime())) throw new Error("An Excel date is invalid. Correct it before importing.");
    return cell.toISOString().slice(0, 10);
  }
  return String(cell ?? "").trim();
}

export function mappedRows(sheet: ImportSheet, mapping: ImportMapping, defaults: ImportDefaults): Record<ImportField, string>[] {
  const indexes = Object.values(mapping).filter(index => index !== undefined && index >= 0);
  if (new Set(indexes).size !== indexes.length) throw new Error("Each spreadsheet column can match only one patient field.");
  for (const field of importFields) {
    if ("required" in field && field.required && mapping[field.key] === undefined && !defaults[field.key]?.trim()) {
      throw new Error(`Match a column for ${field.label.toLowerCase()}${field.key === "location" ? ", or choose a default location" : ""}.`);
    }
  }
  return sheet.rows.slice(1).map(row => Object.fromEntries(importFields.map(field => [
    field.key,
    (mapping[field.key] === undefined ? "" : cellText(row[mapping[field.key]!])) || defaults[field.key]?.trim() || "",
  ])) as Record<ImportField, string>);
}

export function mappedCsv(sheet: ImportSheet, mapping: ImportMapping, defaults: ImportDefaults): string {
  const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const rows = mappedRows(sheet, mapping, defaults);
  const csv = [importFields.map(f => quote(f.key)).join(","), ...rows.map(row => importFields.map(f => quote(row[f.key])).join(","))].join("\r\n");
  if (new TextEncoder().encode(csv).byteLength > 300_000) throw new Error("Matched roster exceeds 300 KB. Split it into smaller imports.");
  return csv;
}

export async function readRoster(file: File): Promise<ImportSheet[]> {
  if (file.size > 1_048_576) throw new Error("Choose a file under 1 MiB and up to 500 patients.");
  if (/\.csv$/i.test(file.name)) return [csvSheet(await file.text())];
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Use a CSV or Excel .xlsx file. Save older .xls workbooks as .xlsx first.");
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  if (!sheets.length) throw new Error("This workbook has no worksheets.");
  // Keep all sheets selectable, including instruction/empty sheets; validate only the selected one.
  const scalar = (cell: unknown): ImportCell => {
    if (cell == null) return null;
    if (cell instanceof Date || typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") return cell;
    throw new Error("A worksheet contains an unsupported cell. Replace formulas or embedded objects with plain values.");
  };
  return sheets.map(sheet => ({
    name: sheet.sheet,
    rows: sheet.data.map(row => row.map(scalar)).filter(row => row.some(cell => cell !== null && String(cell).trim() !== "")),
  }));
}
