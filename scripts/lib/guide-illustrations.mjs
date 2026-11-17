import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Real screenshots are required for a customer release, never silently replaced by mockups. */
export async function loadGuideIllustrations(root) {
  const manifest = JSON.parse(await readFile(resolve(root, "generated-artifacts/guide-screens/manifest.json"), "utf8"));
  if (!manifest.screens?.length || manifest.errors?.length) throw new Error("Capture the current guide screens successfully before generating the illustrated guide.");
  const images = new Map();
  await Promise.all(manifest.screens.map(async screen => {
    if (!/^[a-z0-9-]+$/.test(screen.id) || screen.file !== `generated-artifacts/guide-screens/${screen.id}.png`) throw new Error("Invalid screenshot manifest entry.");
    const bytes = await readFile(resolve(root, screen.file));
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`Not a PNG screenshot: ${screen.id}`);
    images.set(screen.id, { ...screen, uri: `data:image/png;base64,${bytes.toString("base64")}` });
  }));
  const used = new Set();
  return {
    manifest,
    get count() { return used.size; },
    figure(id) {
      const screen = images.get(id);
      if (!screen) throw new Error(`Missing actual screenshot: ${id}. Run the guide capture script.`);
      if (used.has(id)) throw new Error(`Duplicate screenshot placement: ${id}`);
      used.add(id);
      return `<figure class="guide-figure ${screen.width < 600 ? "phone-figure" : ""}" id="figure-${id}">
        <div class="figure-label">SCREEN WALKTHROUGH <span>${String(used.size).padStart(2, "0")}</span></div>
        <button type="button" class="screenshot-open" data-screen="${id}" aria-label="Enlarge screenshot: ${escape(screen.title)}"><img src="${screen.uri}" alt="${escape(screen.title)}" loading="eager"></button>
        <figcaption><strong>Figure ${used.size}. ${escape(screen.title)}</strong>${screen.note ? `<span>${escape(screen.note)}</span>` : ""}<small class="zoom-hint">Select the image to enlarge it in the offline guide.</small></figcaption>
      </figure>`;
    },
  };
}

export const illustrationStyles = `
.illustrated .cover .co-brand{display:flex;align-items:center;gap:28px;flex-wrap:wrap}
.illustrated .co-brand img{width:210px;max-width:none;height:auto}
.illustrated .co-brand .groth{width:168px;border-radius:5px}
.illustrated .cover .eyebrow{margin-top:42px}
.illustrated .cover h1{font-size:58px;letter-spacing:-.035em}
.guide-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:30px;border-top:1px solid var(--line);padding-top:22px;font-size:12px;color:var(--muted)}
.guide-summary b{display:block;color:var(--orange);font-size:11px;letter-spacing:.12em;margin-bottom:4px}
.guide-summary strong{display:block;color:var(--ink);font-size:14px}
.guide-figure{margin:26px 0 30px;padding:14px;background:#f7f7f3;border:1px solid var(--line);border-radius:10px;break-inside:avoid}
.figure-label{font-size:9px;line-height:1.2;letter-spacing:.14em;font-weight:650;color:var(--muted);display:flex;justify-content:space-between;margin-bottom:10px}
.figure-label span{color:var(--orange)}
.screenshot-open{display:block;background:transparent;border:0;border-radius:0;padding:0;width:100%;text-align:left;cursor:zoom-in}
.screenshot-open img{display:block;width:100%;height:auto;max-height:none;border:1px solid #e0e1dc;border-radius:4px}
.guide-figure figcaption{margin-top:12px;font-size:11px;line-height:1.6;color:var(--muted)}
.guide-figure figcaption strong{display:block;color:var(--ink);font-size:12px}
.guide-figure figcaption span,.zoom-hint{display:block;margin-top:4px}
.zoom-hint{font-size:10px;color:#777971}
.phone-figure{max-width:330px;margin-left:auto;margin-right:auto}
.phone-figure .screenshot-open img{max-height:650px;object-fit:contain;background:white}
.guide-callout{border-left:3px solid var(--cyan);background:#f0f6f5;padding:13px 17px;margin:20px 0;font-size:12px}
.guide-callout.before{border-color:var(--orange);background:#fdf5eb}
.guide-callout strong:first-child{color:#344d4d}
.capture-edition{font-size:10px;color:var(--muted);margin-top:15px;line-height:1.6}
#screen-viewer{max-width:96vw;max-height:96vh;width:fit-content;border:1px solid var(--line);border-radius:10px;padding:12px;background:#fff}
#screen-viewer::backdrop{background:#171b19da}
#screen-viewer img{display:block;width:auto;height:auto;max-width:90vw;max-height:80vh;object-fit:contain}
#screen-viewer .viewer-bar{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:0 0 12px;font-size:12px}
@media(max-width:650px){.illustrated .co-brand img{width:160px}.illustrated .co-brand .groth{width:130px}.illustrated .cover h1{font-size:44px}.guide-summary{grid-template-columns:1fr;gap:10px}.guide-figure{padding:9px;margin-left:-8px;margin-right:-8px}.phone-figure{margin-left:auto;margin-right:auto}#screen-viewer img{max-width:85vw}}
@media print{
 .illustrated{font-size:9.5pt;line-height:1.5}
 .illustrated article h2{font-size:22pt;break-before:auto;border-top:1px solid var(--line);padding-top:5mm;margin:9mm 0 5mm}
 .illustrated article>h2:first-child{border:0;padding-top:0;margin-top:0}
 .illustrated h3{font-size:11.5pt;margin:5mm 0 2.5mm}
 .illustrated p{margin:2.5mm 0}
 .illustrated li{margin:1.6mm 0}
 .illustrated ol,.illustrated ul{margin-bottom:4mm}
 .illustrated footer{margin-top:5mm;padding-top:3mm}
 .illustrated .cover .co-brand{gap:9mm;flex-wrap:nowrap}
 .illustrated .co-brand img{width:56mm}
 .illustrated .co-brand .groth{width:44mm}
 .illustrated .cover .eyebrow{margin-top:24mm}
 .illustrated .cover h1{font-size:40pt}
 .guide-summary{font-size:9pt;margin-top:9mm;padding-top:5mm;gap:6mm}
 .guide-summary strong{font-size:10pt}.guide-summary b{font-size:8pt}
 .guide-figure{margin:4mm 0 5mm;padding:3mm;border-radius:2mm;background:#f8f8f4;break-inside:avoid}
 .screenshot-open img{max-height:112mm;width:auto;max-width:100%;margin:auto;object-fit:contain}
 .figure-label{font-size:6.5pt;margin-bottom:2mm}
 .guide-figure figcaption{font-size:8pt;margin-top:2.5mm}
 .guide-figure figcaption strong{font-size:8.5pt}
 .phone-figure{width:66mm;margin-left:auto;margin-right:auto}
 .phone-figure .screenshot-open img{max-height:120mm}
 .zoom-hint,#screen-viewer{display:none}
 .guide-callout{font-size:9pt;padding:3mm 4mm;margin:4mm 0;break-inside:avoid}
 .capture-edition{font-size:8pt}
}
`;

export const screenshotViewer = `<dialog id="screen-viewer" aria-label="Enlarged application screenshot"><div class="viewer-bar"><strong id="screen-viewer-title"></strong><button type="button" id="close-screen-viewer">Close</button></div><img alt=""></dialog>
<script>
const viewer=document.getElementById('screen-viewer');
document.addEventListener('click',event=>{const button=event.target.closest('[data-screen]');if(!button)return;const img=button.querySelector('img');viewer.querySelector('img').src=img.src;viewer.querySelector('img').alt=img.alt;document.getElementById('screen-viewer-title').textContent=img.alt;viewer.showModal();});
document.getElementById('close-screen-viewer').addEventListener('click',()=>viewer.close());
viewer.addEventListener('click',event=>{if(event.target===viewer)viewer.close();});
</script>`;
