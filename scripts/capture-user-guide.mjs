/**
 * Read-only screenshots of the real synthetic app for the customer guide.
 * Requires a running Preview and Chromium; uses its DevTools protocol, no packages.
 * It signs in through the existing public sample-account controls, never embeds passwords.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
// The loopback artifact proxy serves the same Preview app without host-injected UI.
const base = process.env.GUIDE_CAPTURE_URL || "http://127.0.0.1:80";
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):80\/?$/.test(base) && !/^https:\/\/[^/]+\.replit\.dev\/?$/.test(base)) throw new Error("Use the local artifact proxy or synthetic development Preview, not production.");
const out = resolve(root, "generated-artifacts/guide-screens");
await mkdir(out, { recursive: true });
const port = 9337;
const chrome = spawn("chromium", ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${port}`, `--user-data-dir=${out}/browser-profile`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
let launchError;
chrome.on("error", e => { launchError = e; });
chrome.stderr.on("data", () => {});
const pause = ms => new Promise(r => setTimeout(r, ms));
let socket;
let sequence = 0;
const pending = new Map();
const captured = [];
const selected = new Set(process.argv.slice(2));
const errors = [];
let oldManifest = [];
try { oldManifest = JSON.parse(await readFile(resolve(out, "manifest.json"), "utf8")).screens; } catch {}
const wanted = id => !selected.size || selected.has(id);
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`DevTools timeout: ${method}`)); }, 30000);
  pending.set(id, { resolve, reject, timer });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const response = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text + ": " + (response.exceptionDetails.exception?.description || ""));
  return response.result.value;
};
const waitFor = async (expression, seconds = 20) => {
  for (let i = 0; i < seconds * 4; i++) { if (await evaluate(expression)) return; await pause(250); }
  throw new Error(`Screen not ready: ${expression}`);
};
const click = async selector => {
  const found = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.click();return true})()`);
  if (!found) throw new Error(`Missing control: ${selector}`);
  await pause(500);
};
const ready = async () => {
  await waitFor("document.readyState === 'complete'");
  await pause(1100);
  await evaluate("document.fonts.ready.then(()=>true)");
  await pause(350);
};
const nav = async path => {
  await call("Page.navigate", { url: new URL(path, base).href });
  await ready();
};
const viewport = async (width, height) => call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1.5, mobile: width < 600 });
const shot = async (id, title, chapter, selector = "main", note = "") => {
  if (!wanted(id)) return;
  await pause(350);
  const state = await evaluate(`({error:!!document.querySelector('[data-testid="state-error"]'),locked:!!document.querySelector('[data-testid="input-unlock-password"]')})`);
  if (state.error || state.locked) throw new Error(`Cannot capture error/locked screen: ${id}`);
  // Capture app content, not browser chrome; retain the app's synthetic-data notice.
  const region = selector === "body" ? "#root" : selector;
  const rect = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(region)});if(!e)return null;const r=e.getBoundingClientRect();const x=Math.max(0,r.x),y=Math.max(0,r.y);return {x:x+scrollX,y:y+scrollY,width:Math.min(r.right,innerWidth)-x,height:Math.min(r.bottom,innerHeight)-y,scale:1}})()`);
  if (!rect || rect.width < 50 || rect.height < 50) throw new Error(`Invalid screen region: ${id}`);
  const result = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, clip: rect });
  await writeFile(resolve(out, `${id}.png`), Buffer.from(result.data, "base64"));
  captured.push({ id, title, chapter, file: `generated-artifacts/guide-screens/${id}.png`, width: Math.round(rect.width), height: Math.round(rect.height), note });
  console.log(`Captured ${id}: ${title}`);
};
const attempt = async (id, fn) => { try { await fn(); } catch (e) { errors.push({ id, error: e.message }); console.error(`Capture ${id}: ${e.message}`); } };
const login = async persona => {
  await nav("/login");
  await evaluate(`document.querySelector('[data-testid="card-demo-credentials"]').open=true`);
  await click(`[data-testid="button-fill-${persona}"]`);
  await click('[data-testid="button-login"]');
  await waitFor("location.pathname !== '/login'", 30);
  await ready();
};
const logout = async () => {
  const selector = await evaluate(`['button-logout','button-patient-signout','button-caregiver-signout'].map(id=>'[data-testid="'+id+'"]').find(s=>document.querySelector(s))||null`);
  if (!selector) throw new Error("No sign-out control");
  await click(selector);
  await waitFor("location.pathname === '/login'");
};
try {
  let target;
  for (let i = 0; i < 40; i++) {
    if (launchError) throw launchError;
    try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json(); break; } catch { await pause(250); }
  }
  if (!target?.webSocketDebuggerUrl) throw new Error("Chromium did not start.");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer); pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
  };
  await call("Page.enable");
  await call("Runtime.enable");
  await viewport(1180, 820);
  await nav("/login");
  await shot("login", "Sign in to your care workspace", 3, "body", "The current co-branded login, with empty fields. Use your own named account.");
  const mobileIds = ["patient-today", "questionnaire", "patient-plan", "caregiver"];
  const mobileOnly = selected.size > 0 && [...selected].every(id => mobileIds.includes(id));
  if (!mobileOnly) {
  await login("staff");
  await shot("today", "Today: begin with the patients who need attention", 14, "body");
  await nav("/admin");
  await shot("practice", "Practice details and care defaults", 4);
  await click('[data-testid="tab-accounts"]');
  await ready();
  await shot("accounts", "Named accounts and access management", 5);
  await nav("/policies");
  await shot("policies", "Review included policies before adapting a version", 6);
  await nav("/patients");
  await shot("patients", "The searchable, sortable patient panel", 8);
  await click('[data-testid="button-new-patient"]');
  await shot("registration", "Register a patient without manufacturing enrollment", 8, '[role="dialog"]', "The form is shown before submission; no patient was created for this image.");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await pause(350);
  await click('[data-testid="button-import-patients"]');
  const csv = "firstName,lastName,dob,location,mrn\\nAlex,Training,1960-05-14,Garden City,TRAIN-001\\nRobin,Training,1954-09-23,Garden City,TRAIN-002";
  await writeFile(resolve(out, "training-roster.csv"), csv.replaceAll("\\n", "\n"));
  const dom = await call("DOM.getDocument");
  const node = await call("DOM.querySelector", { nodeId: dom.root.nodeId, selector: '[data-testid="input-import-file"]' });
  await call("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [resolve(out, "training-roster.csv")] });
  await pause(1800);
  await shot("import-mapping", "Match roster columns and review defaults", 7, '[role="dialog"]', "Fictional training rows are loaded in the browser only, not imported.");
  await evaluate(`document.querySelector('[data-testid="preview-import"]')?.scrollIntoView({block:'center'})`);
  await shot("import-preview", "Check the preview before validating the roster", 7, '[role="dialog"]', "This preview is not an import completion receipt.");
  await nav("/patients");
  const roster = await evaluate("fetch('/api/patients').then(r=>r.json())");
  const patient = roster.find(p => p.firstName === "Margaret" && p.lastName === "Wilson");
  if (!patient) throw new Error("The documented synthetic Margaret Wilson case is unavailable; do not substitute a real patient.");
  const chart = `/patients/${patient.id}`;
  await nav(chart);
  for (const [id, tab, title, chapter] of [
    ["profile", "profile", "Reconcile the clinical profile", 9],
    ["enrollment", "enrollment", "Active programs and captured consent", 10],
    ["care-plan", "careplans", "Review signed care plans and their versions", 11],
    ["readings", "readings", "Readings, validity and monitoring history", 12],
    ["notes", "notes", "Clinical notes and signed-document controls", 16],
    ["time", "time", "Time entries and qualifying activity", 16],
    ["messages", "messages", "Patient messages and documented outreach", 17],
    ["files", "files", "Supporting PDFs are separate from signed clinical records", 21],
  ]) await attempt(id, async () => { await click(`[data-testid="tab-${tab}"]`); await ready(); await shot(id, title, chapter); });
  await nav("/devices");
  await shot("devices", "Device inventory and patient assignment", 12);
  await nav("/worklists");
  await shot("worklists", "Work from a focused queue", 15);
  await nav("/billing");
  await shot("billing", "Review calculated evidence and blockers", 19, "main", "November 2026 is the displayed period; eligibility is provisional, not a submitted claim.");
  await nav("/reports");
  await shot("reports", "Practice reporting and controlled exports", 20);
  await nav("/admin");
  await click('[data-testid="tab-operations"]');
  await ready();
  await shot("operations", "Operations: investigate exceptions, not routine daily care", 22, "main", "Retained historical simulator-attention items can appear here; counts are not a production availability certificate.");
  await logout();
  }
  await viewport(390, 844);
  await login("patient");
  await shot("patient-today", "Patient Today on a phone", 13, "body");
  await click('[data-testid="pnav-checkin"]');
  await ready();
  await shot("questionnaire", "Complete the assigned check-in", 18, "body", "The form is shown without submitting responses.");
  await click('[data-testid="pnav-plan"]');
  await ready();
  await evaluate(`document.querySelector('[data-testid="patient-plan-documents"]')?.scrollIntoView({block:'center'})`);
  await shot("patient-plan", "Patient access to signed plan PDFs and history", 13, '[data-testid="patient-plan-documents"]', "A focused view of the Signed plan PDFs section in Plan.");
  await logout();
  await login("caregiver");
  await shot("caregiver", "The caregiver sees only shared categories", 13, "body");
  await logout();
} finally {
  const screens = [...oldManifest.filter(s => !captured.some(c => c.id === s.id)), ...captured];
  await writeFile(resolve(out, "manifest.json"), JSON.stringify({ capturedAt: new Date().toISOString(), sourceRevision: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), source: "Synthetic development Preview via local artifact proxy; actual app screens, not mockups", screens, errors }, null, 2));
  socket?.close();
  const stopped = new Promise(resolve => chrome.once("exit", resolve));
  chrome.kill("SIGTERM");
  await Promise.race([stopped, pause(3000)]);
  await rm(resolve(out, "browser-profile"), { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
if (errors.length) { console.error(`${errors.length} individual captures need attention; see manifest.`); process.exitCode = 1; }
else console.log(`Saved ${captured.length} real screenshots. No clinical records, billing decisions, settings or messages were submitted.`);
