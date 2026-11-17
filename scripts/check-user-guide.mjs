import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const read = file => readFile(resolve(root, file), "utf8");
const [html, source, implementation, manifestText] = await Promise.all([
  read("generated-artifacts/MAHALO-USER-GUIDE.html"),
  read("docs/USER-GUIDE.md"),
  read("generated-artifacts/MAHALO-IMPLEMENTATION-GUIDE.html"),
  read("generated-artifacts/guide-screens/manifest.json"),
]);
const manifest = JSON.parse(manifestText);
const expected = [...source.matchAll(/^:::screen ([a-z0-9-]+)$/gm)].map(m => m[1]);
const chapterIds = [...html.matchAll(/<h2 id="(chapter-\d+)"/g)].map(m => m[1]);
assert.equal(chapterIds.length, 24);
assert.equal(new Set(chapterIds).size, 24);
for (const id of chapterIds) assert.equal((html.match(new RegExp(`href="#${id}"`, "g")) || []).length, 2);
assert.equal(new Set(expected).size, expected.length);
assert.equal(expected.length, 26);
assert.equal(manifest.errors.length, 0);
for (const id of expected) {
  assert.ok(manifest.screens.some(s => s.id === id), `Capture missing: ${id}`);
  assert.ok(html.includes(`id="figure-${id}"`), `Figure missing: ${id}`);
}
assert.equal((html.match(/class="guide-figure /g) || []).length, expected.length);
assert.ok(html.includes('alt="Groth Pain &amp; Spine"'));
assert.ok(html.includes('id="screen-viewer"') && html.includes("viewer.showModal()"));
assert.ok(!html.includes(":::screen"));
assert.ok(!/MahaloDemo\d|token=[A-Za-z0-9]|replit\.dev/.test(html), "No public sample password, private token or Preview URL in the customer artifact");
const resourceUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
assert.ok(resourceUrls.every(url => url.startsWith("data:") || url.startsWith("#")), "All assets and navigation must work offline");
assert.ok(!/url\("(?!data:)/.test(html), "Fonts must be embedded");
assert.equal((implementation.match(/<h2 id="chapter-/g) || []).length, 16);
assert.ok(!implementation.includes('class="guide-figure'));
assert.ok(implementation.includes("Practice implementation guide"));
const pdfPath = resolve(root, "generated-artifacts/MAHALO-USER-GUIDE.pdf");
const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { maxBuffer: 5 * 1024 * 1024, encoding: "utf8" });
const normalized = text.replace(/-\s*\n\s*/g, "-").replace(/\s+/g, " ");
for (const phrase of ["José", "Zoë", "Signed plan PDFs", "RPM plan signing requires an assigned RPM device", "Recalculate", "24. What the owner must provide"]) {
  assert.ok(normalized.includes(phrase), `PDF text missing: ${phrase}`);
}
assert.ok(!text.includes("\uFFFD"), "PDF text must not contain replacement characters");
for (let n = 1; n <= expected.length; n++) assert.ok(text.includes(`Figure ${n}.`), `PDF figure ${n} missing`);
const fonts = execFileSync("pdffonts", [pdfPath], { encoding: "utf8" });
assert.ok(fonts.includes("NotoSans") && fonts.includes("VictorSerif"), "Official brand fonts must appear in the actual PDF");
const bytes = await readFile(resolve(root, "generated-artifacts/MAHALO-PATIENT-IMPORT-TEMPLATE.xlsx"));
assert.equal(bytes.subarray(0, 2).toString(), "PK");
const require = createRequire(resolve(root, "artifacts/api-server/package.json"));
const ExcelJS = require("exceljs");
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(bytes);
assert.deepEqual(workbook.worksheets.map(s => s.name), ["Instructions", "Patients"]);
assert.equal(workbook.getWorksheet("Patients").rowCount, 1, "The template must have headers, not a seeded roster");
assert.equal(workbook.getWorksheet("Patients").columnCount, 13);
assert.ok(bytes.length > 1000);
console.log(`PASS customer guide: 24 chapters, ${expected.length} real embedded screenshots, offline resources, contents links, PDF text/fonts, implementation-mode compatibility and Excel-template output.`);
