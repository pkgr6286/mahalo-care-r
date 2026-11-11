import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
const root=resolve(import.meta.dirname,"..");
const md=await readFile(resolve(root,"docs/OWNER-HANDOVER.md"),"utf8");
const esc=s=>s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const inline=s=>esc(s).replace(/https:\/\/[^\s<]+/g,url=>{const clean=url.replace(/[.,;]$/,"");return `<a href="${clean}" rel="noreferrer">${clean}</a>${url.slice(clean.length)}`;});
let body="",list=null;
for(const line of md.split("\n").slice(4)){
  const item=line.match(/^(-|\d+\.) (.*)$/);
  if(!item&&list){body+=`</${list}>`;list=null;}
  if(line.startsWith("## "))body+=`<h2>${esc(line.slice(3))}</h2>`;
  else if(item){const kind=item[1]==="-"?"ul":"ol";if(list!==kind){if(list)body+=`</${list}>`;body+=`<${kind}>`;list=kind;}body+=`<li>${inline(item[2])}</li>`;}
  else if(line.trim())body+=`<p>${inline(line)}</p>`;
}
if(list)body+=`</${list}>`;
const data=async(path,mime)=>`data:${mime};base64,${(await readFile(resolve(root,path))).toString("base64")}`;
const logo=await data("artifacts/mahalo-care/public/brand/mahalo-care-color.svg","image/svg+xml");
const sans=await data("artifacts/mahalo-care/public/brand/fonts/noto-sans-mahalo-latin.woff2","font/woff2");
const serif=await data("artifacts/mahalo-care/public/brand/fonts/victor-serif-smooth-400.otf","font/otf");
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mahalo Care — Owner handover</title><style>
@font-face{font-family:MahaloSans;src:url('${sans}') format('woff2');font-weight:100 900}@font-face{font-family:Victor;src:url('${serif}') format('opentype');font-weight:400}
*{box-sizing:border-box}body{margin:0;background:#f5f4ef;color:#202221;font:15px/1.7 MahaloSans,Arial,sans-serif}main{max-width:980px;margin:40px auto;background:#fff;border:1px solid #e0e0d9;border-radius:18px;overflow:hidden}header{padding:42px 52px;border-bottom:1px solid #deded8;background:#faf9f6}header img{width:210px;max-width:65%}.eyebrow{margin-top:35px;color:#6a6d67;text-transform:uppercase;letter-spacing:.14em;font-size:11px}h1{font:400 clamp(36px,6vw,58px)/1.12 Victor,Georgia,serif;margin:13px 0 18px;letter-spacing:-.03em}header p{max-width:650px;color:#656960}button{border:1px solid #292b28;border-radius:24px;padding:10px 18px;background:#202221;color:white;font:inherit;font-size:12px;cursor:pointer}.stats{display:grid;grid-template-columns:repeat(4,1fr);margin-top:30px;gap:12px}.stats div{border:1px solid #deded8;padding:15px 17px;border-radius:10px;background:#fff}.stats strong{display:block;font:400 30px Victor,Georgia,serif}.stats small{font-size:11px;color:#62665f}.notice{padding:17px 24px;background:#fff3e8;border-bottom:1px solid #f3d6bd;font-size:12px}.content{padding:10px 52px 45px}h2{font:400 28px/1.25 Victor,Georgia,serif;letter-spacing:-.02em;padding-top:28px;margin-top:25px;border-top:1px solid #e6e6df;break-after:avoid}p{margin:12px 0}li{margin:10px 0;padding-left:4px}ul,ol{padding-left:22px}a{color:#66551b;overflow-wrap:anywhere}footer{font-size:11px;padding:22px 52px;background:#f6f6f1;color:#666b60;border-top:1px solid #deded8}@media(max-width:650px){main{margin:0;border:0;border-radius:0}header,.content,footer{padding-left:23px;padding-right:23px}.stats{grid-template-columns:repeat(2,1fr)}body{font-size:14px}}@media print{body{background:#fff;font-size:10pt}main{margin:0;border:0;max-width:none}header{padding-top:0}.content{padding:0}header,footer{padding-left:0;padding-right:0}button{display:none}h2{font-size:21pt}.stats{grid-template-columns:repeat(4,1fr)}li,p{orphans:3;widows:3}a{color:inherit;text-decoration:none}.notice{margin-bottom:15px}footer{margin-top:25px}}
</style><main><header><img src="${logo}" alt="Mahalo Care"><div class="eyebrow">Single-practice platform · November 11, 2026</div><h1>Owner handover</h1><p>What is implemented, what was verified locally, how to demonstrate it, and the decisions needed before real clinical deployment.</p><button onclick="window.print()">Print / Save PDF</button><div class="stats"><div><strong>30</strong><small>Fictional clinical cases</small></div><div><strong>36</strong><small>Clinical enrollments</small></div><div><strong>119</strong><small>Passing unit tests</small></div><div><strong>823</strong><small>Passing HTTP checks</small></div></div></header><div class="notice">Synthetic data only. Local technical acceptance is not clinical, security or regulatory certification. External vendor delivery and GCP rollout remain separately qualified steps.</div><article class="content">${body}</article><footer>Self-contained document with official Mahalo brand assets. No external fonts, scripts or tracking. Detailed technical evidence: LOCAL-ACCEPTANCE.md and IMPLEMENTATION-COVERAGE.md in the repository.</footer></main></html>`;
await mkdir(resolve(root,"generated-artifacts"),{recursive:true});
await writeFile(resolve(root,"generated-artifacts/MAHALO-OWNER-HANDOVER.html"),html);
console.log("Created self-contained Mahalo owner handover.");
