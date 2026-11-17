import { spawn } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

// A local-file document check, not an application workflow or acceptance rerun.
const root = resolve(import.meta.dirname, "..");
const profile = `/tmp/mahalo-guide-offline-${process.pid}`;
const chrome = spawn("chromium", ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--remote-debugging-port=9341", `--user-data-dir=${profile}`, "--host-resolver-rules=MAP * ~NOTFOUND", "about:blank"],
{ stdio: ["ignore", "ignore", "ignore"] });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const requests = new Map();
let socket, nextId = 0;
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => { requests.delete(id); reject(new Error(`Timed out: ${method}`)); }, 20000);
  requests.set(id, { resolve, reject, timer });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
try {
  let page;
  for (let i = 0; i < 40; i++) {
    try { page = await (await fetch("http://127.0.0.1:9341/json/new?about:blank", { method: "PUT" })).json(); break; }
    catch { await pause(250); }
  }
  assert.ok(page?.webSocketDebuggerUrl, "Chromium must start");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data), request = requests.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); requests.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pathToFileURL(resolve(root, "generated-artifacts/MAHALO-USER-GUIDE.html")).href });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    ready = await evaluate("document.readyState==='complete' && !!document.querySelector('[data-screen]') && [...document.images].filter(i=>i.getAttribute('src')).every(i=>i.complete&&i.naturalWidth>0)");
    if (ready) break;
    await pause(250);
  }
  assert.ok(ready, "Every embedded image must load from the local file with DNS blocked");
  await evaluate("document.fonts.ready.then(()=>true)");
  assert.equal(await evaluate("document.querySelectorAll('figure.guide-figure').length"), 26);
  const cover = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(resolve(root, "generated-artifacts/guide-offline-cover.png"), Buffer.from(cover.data, "base64"));
  await evaluate("document.querySelector('[data-screen]').click()");
  assert.ok(await evaluate("document.querySelector('#screen-viewer').open"), "Image enlargement must open");
  await evaluate("document.querySelector('#screen-viewer img').decode().then(()=>true)");
  assert.ok(await evaluate("document.querySelector('#screen-viewer img').naturalWidth>0"), "The enlarged image must load");
  await evaluate("document.querySelector('#close-screen-viewer').click()");
  assert.ok(await evaluate("!document.querySelector('#screen-viewer').open"), "Image enlargement must close");
  await evaluate("document.querySelector('a[href=\"#chapter-13\"]').click()");
  assert.equal(await evaluate("location.hash"), "#chapter-13");
  console.log("PASS offline browser: all 26 figures and embedded assets loaded with DNS blocked; image enlargement opened/closed; contents navigation worked.");
} finally {
  socket?.close();
  for (const request of requests.values()) clearTimeout(request.timer);
  const stopped = new Promise(resolve => chrome.once("exit", resolve));
  chrome.kill("SIGTERM");
  await Promise.race([stopped, pause(3000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
