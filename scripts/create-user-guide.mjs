import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const source = await readFile(resolve(root, "docs/USER-GUIDE.md"), "utf8");
const esc = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const inline = value => esc(value).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
const cells = line => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
const toc = [];
let body = "", list = "", table = false, code = false, codeLines = [];
const closeList = () => { if (list) body += `</${list}>`; list = ""; };
const closeTable = () => { if (table) body += "</tbody></table></div>"; table = false; };
for (const line of source.split("\n").slice(3)) {
  if (line.startsWith("```")) {
    closeList(); closeTable();
    if (code) body += `<pre><code>${esc(codeLines.join("\n"))}</code></pre>`;
    code = !code; codeLines = []; continue;
  }
  if (code) { codeLines.push(line); continue; }
  if (line.startsWith("|")) {
    closeList();
    if (/^\|\s*[-:]+\s*\|/.test(line)) continue;
    if (!table) {
      body += `<div class="table-wrap"><table><thead><tr>${cells(line).map(cell => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>`;
      table = true;
    } else body += `<tr>${cells(line).map(cell => `<td>${inline(cell)}</td>`).join("")}</tr>`;
    continue;
  }
  closeTable();
  const item = line.match(/^(-|\d+\.) (.*)$/);
  if (item) {
    const kind = item[1] === "-" ? "ul" : "ol";
    if (list !== kind) { closeList(); body += `<${kind}>`; list = kind; }
    body += `<li>${inline(item[2])}</li>`; continue;
  }
  closeList();
  if (line.startsWith("## ")) {
    const title = line.slice(3), number = title.match(/^\d+/)?.[0] || String(toc.length + 1), id = `chapter-${number}`;
    toc.push({ title, id });
    body += `<h2 id="${id}">${esc(title)}</h2>`;
  } else if (line.startsWith("### ")) body += `<h3>${inline(line.slice(4))}</h3>`;
  else if (line.trim()) body += `<p>${inline(line)}</p>`;
}
closeList(); closeTable();
const data = async (path, mime) => `data:${mime};base64,${(await readFile(resolve(root, path))).toString("base64")}`;
const [logo, sans, serif] = await Promise.all([
  data("artifacts/mahalo-care/public/brand/mahalo-care-color.svg", "image/svg+xml"),
  data("artifacts/mahalo-care/public/brand/fonts/noto-sans-mahalo-latin.woff2", "font/woff2"),
  data("artifacts/mahalo-care/public/brand/fonts/victor-serif-smooth-400.otf", "font/otf"),
]);
const contents = toc.map(section => `<a href="#${section.id}">${esc(section.title)}</a>`).join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mahalo Care — Practice and care-team user guide</title><meta name="description" content="A practical guide to setting up Mahalo Care, importing patients, enrolling them and managing care."><style>
@font-face{font-family:MahaloSans;src:url("${sans}") format("woff2");font-weight:100 900;font-display:block}
@font-face{font-family:MahaloSerif;src:url("${serif}") format("opentype");font-weight:400;font-display:block}
:root{--ink:#232423;--muted:#62635e;--paper:#f8f7f3;--orange:#d85b14;--line:#dfdfd7;--cyan:#197d8b}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:30px}body{margin:0;background:var(--paper);color:var(--ink);font-family:MahaloSans,sans-serif;font-size:14px;line-height:1.75}a{color:var(--orange);text-decoration:none}a:hover{text-decoration:underline}.layout{display:grid;grid-template-columns:260px minmax(0,930px);justify-content:center;max-width:1340px;margin:auto}.sidebar{position:sticky;top:0;height:100vh;overflow:auto;padding:32px 24px;border-right:1px solid var(--line);background:#efeee8}.sidebar img{width:160px;height:auto;display:block;margin-bottom:26px}.sidebar .label{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:650}.sidebar a{display:block;font-size:11px;line-height:1.5;color:var(--muted);padding:6px 0}.sidebar a:hover{color:var(--orange)}main{min-width:0;background:#fff;padding:64px 64px 30px}.cover{padding-bottom:36px;border-bottom:1px solid var(--line);margin-bottom:32px}.cover img{width:220px;max-width:80%;height:auto}.eyebrow{font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--orange);font-weight:650;margin-top:36px}h1,h2,h3{font-weight:400;line-height:1.18}h1{font-family:MahaloSerif,serif;font-size:54px;letter-spacing:-.04em;margin:18px 0 22px;max-width:700px}.subtitle{font-size:17px;color:var(--muted);max-width:620px;line-height:1.65}.cover-meta{display:flex;flex-wrap:wrap;gap:12px 28px;border-top:1px solid var(--line);padding-top:22px;margin-top:30px;color:var(--muted);font-size:11px}.cover-meta strong{display:block;color:var(--ink);font-size:13px}.actions{margin-top:24px;display:flex;align-items:center;gap:16px;font-size:11px;color:var(--muted)}button{border:1px solid var(--ink);border-radius:30px;background:var(--ink);color:#fff;padding:10px 20px;cursor:pointer;font:inherit;font-size:12px}.notice{padding:16px 20px;border-left:3px solid var(--orange);background:#fff5e9;font-size:12px;color:#76411e;line-height:1.65;margin:26px 0}.print-contents{display:none}h2{font-family:MahaloSerif,serif;font-size:32px;letter-spacing:-.025em;margin:48px 0 22px;border-top:1px solid var(--line);padding-top:30px;scroll-margin-top:30px}h3{font-size:17px;font-weight:650;margin:26px 0 12px}p{margin:12px 0}strong{font-weight:650}li{padding-left:6px;margin:8px 0}ol,ul{padding-left:24px;margin:12px 0 22px}ol li::marker{color:var(--orange);font-weight:650}ul li::marker{color:var(--cyan)}code{font-size:.88em;background:#f0efe9;padding:2px 5px;border-radius:4px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0efe9;border:1px solid var(--line);border-radius:8px;padding:14px;font-size:11px;line-height:1.65}pre code{padding:0;background:none}.table-wrap{overflow:auto;margin:18px 0 26px;border:1px solid var(--line);border-radius:8px}table{width:100%;border-collapse:collapse;font-size:11px;line-height:1.6}th,td{padding:11px 13px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}th{background:#efeee8;font-weight:650;color:#45463f}td:first-child{font-weight:550;width:26%}tr:last-child td{border-bottom:0}tbody tr:nth-child(even){background:#fafaf7}footer{margin-top:44px;border-top:1px solid var(--line);padding-top:20px;color:var(--muted);font-size:10px}.edition{color:var(--muted);font-size:11px}
@media(max-width:960px){.layout{display:block}.sidebar{display:none}main{padding:32px 24px}h1{font-size:42px}.print-contents{display:block}.print-contents a{display:block;font-size:12px;padding:4px 0}.table-wrap{margin-left:0;margin-right:0}table{min-width:500px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@page{size:A4;margin:18mm 17mm 20mm;@bottom-left{content:"Mahalo Care · Practice and care-team guide";font-family:MahaloSans;font-size:8pt;color:#777}@bottom-right{content:counter(page);font-family:MahaloSans;font-size:8pt;color:#777}}
@media print{body{background:#fff;font-size:10pt;line-height:1.55}.layout{display:block;max-width:none}.sidebar,.actions{display:none}main{padding:0}.cover{min-height:240mm;padding:10mm 0 0;margin:0;border:0;break-after:page}.cover img{width:58mm}.eyebrow{margin-top:34mm}h1{font-size:42pt;max-width:165mm;margin-top:8mm}.subtitle{font-size:13pt}.cover-meta{margin-top:14mm;gap:9mm}.cover-meta strong{font-size:10pt}.notice{font-size:9pt}.print-contents{display:block;break-after:page}.print-contents h2{border:0;padding:0;margin-top:0;break-before:auto}.print-contents a{display:block;font-size:10pt;line-height:1.5;padding:2mm 0;color:var(--ink)}h2{font-size:24pt;border-top:0;padding-top:0;margin:0 0 7mm;break-before:page;break-after:avoid}h3{font-size:12pt;margin:7mm 0 3mm;break-after:avoid}p{margin:3mm 0;orphans:3;widows:3}li{margin:2mm 0;break-inside:avoid}ol,ul{margin-bottom:5mm}table{font-size:8.5pt;min-width:0}th,td{padding:2.5mm 3mm}thead{display:table-header-group}tr{break-inside:avoid}.table-wrap{overflow:visible;border-radius:0;margin:5mm 0}pre{font-size:8pt;break-inside:avoid}footer{font-size:8pt}a{color:inherit}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="layout"><nav class="sidebar" aria-label="Guide chapters"><img src="${logo}" alt="Mahalo Care"><div class="label">User guide · Contents</div>${contents}</nav><main><header class="cover"><img src="${logo}" alt="Mahalo Care"><div class="eyebrow">Practice and care-team user guide</div><h1>From an empty practice<br>to coordinated care.</h1><p class="subtitle">Set up once. Enroll patients correctly. Let routine work happen in the background, so your team can focus on care.</p><div class="cover-meta"><div><strong>Single-practice edition</strong>Administrator to patient workflows</div><div><strong>11 November 2026</strong>Excel and CSV onboarding included</div></div><div class="notice">Current workspace: fictional patients only. This is a guide to the implemented product, not clinical, payer, security or regulatory certification.</div><div class="actions"><button onclick="window.print()">Print / Save PDF</button><span>Use Ctrl/Cmd + F to find a topic. No internet connection is needed to read this document.</span></div></header><section class="print-contents" aria-label="Contents"><h2>Contents</h2>${contents}</section><article>${body}</article><footer>Official Mahalo logo and typefaces. This document is self-contained, with no external fonts, images, tracking or network requests. Technical deployment references accompany the source code; the guide does not grant approval to handle real patient data.</footer></main></div></body></html>`;
await mkdir(resolve(root, "generated-artifacts"), { recursive: true });
await writeFile(resolve(root, "generated-artifacts/MAHALO-USER-GUIDE.html"), html);

const require = createRequire(resolve(root, "artifacts/api-server/package.json"));
const ExcelJS = require("exceljs");
const workbook = new ExcelJS.Workbook();
workbook.creator = "Mahalo Care";
const instructions = workbook.addWorksheet("Instructions");
for (const text of [
  "Mahalo Care — patient roster template",
  "Use the Patients worksheet. Add one fictional patient per row after the header.",
  "Required: firstName, lastName, dob; location must match an active practice location or be supplied as a default in the import screen.",
  "Use YYYY-MM-DD or an actual Excel date cell for dob. Keep MRNs and phone numbers formatted as Text.",
  "Separate multiple conditions or medications with a vertical bar. These are summaries, not verified clinical diagnoses or prescriptions.",
  "Maximum 500 patients per import. The file must be under 1 MiB and matched CSV under 300 KB.",
  "Import creates a roster, not patient accounts, consent, enrollment, signed plans or billable time.",
  "This environment permits fictional patients only. Do not enter real patient information.",
]) instructions.addRow([text]);
instructions.getColumn(1).width = 115;
instructions.getColumn(1).alignment = { wrapText: true, vertical: "top" };
instructions.eachRow(row => { row.height = 34; });
const template = workbook.addWorksheet("Patients");
template.addRow((await readFile(resolve(root, "docs/templates/patient-import.csv"), "utf8")).trim().split(","));
template.views = [{ state: "frozen", ySplit: 1 }];
template.autoFilter = "A1:M1";
template.columns.forEach(column => { column.width = 23; column.numFmt = "@"; });
template.getRow(1).height = 26;
template.getRow(1).eachCell(cell => {
  cell.font = { bold: true, color: { argb: "FF232423" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0E4" } };
  cell.border = { bottom: { style: "thin", color: { argb: "FFFF7A21" } } };
});
await workbook.xlsx.writeFile(resolve(root, "generated-artifacts/MAHALO-PATIENT-IMPORT-TEMPLATE.xlsx"));
console.log(`Created branded user guide (${toc.length} chapters) and blank Excel roster template.`);
