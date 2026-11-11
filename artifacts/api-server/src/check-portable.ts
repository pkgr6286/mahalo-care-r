import assert from "node:assert/strict";
import {once} from "node:events";
import {resolve} from "node:path";
process.chdir(resolve(import.meta.dirname,"../../.."));
process.env.NODE_ENV="production";
process.env.SERVE_WEB="true";
const {default:app}=await import("./app");
const {pool}=await import("@workspace/db");
const server=app.listen(0,"127.0.0.1");
try{
  await once(server,"listening");
  const address=server.address();assert.ok(address&&typeof address==="object");
  const base=`http://127.0.0.1:${address.port}`;
  const root=await fetch(base);assert.equal(root.status,200);assert.equal(root.headers.get("cache-control"),"no-store");
  const html=await root.text();assert.match(html,/<div id="root"/);
  const deep=await fetch(base+"/patients/portable-check");assert.equal(deep.status,200);assert.equal(await deep.text(),html);
  const unknown=await fetch(base+"/api/not-a-real-api-route");assert.equal(unknown.status,401);assert.match(unknown.headers.get("content-type")??"",/json/);
  const login=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:"demo@mahalo.care",password:"MahaloDemo2026!"})});assert.equal(login.status,200);
  const cookie=login.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
  try{
    const authenticated=await fetch(base+"/api/not-a-real-api-route",{headers:{cookie}});assert.ok([403,404].includes(authenticated.status),"Default-deny authorization or API not-found must reject an unknown route");assert.match(authenticated.headers.get("content-type")??"",/json/);assert.equal(typeof ((await authenticated.json()) as {error:unknown}).error,"string");
  }finally{
    const logout=await fetch(base+"/api/auth/logout",{method:"POST",headers:{cookie}});assert.equal(logout.status,200);
  }
  const me=await fetch(base+"/api/auth/me");assert.equal(me.status,401);assert.match(me.headers.get("cache-control")??"",/private, no-store/);
  const health=await fetch(base+"/api/healthz");assert.equal(health.status,200);
  const asset=html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];assert.ok(asset,"Build must use root-relative hashed assets");
  const js=await fetch(base+asset);assert.equal(js.status,200);assert.match(js.headers.get("content-type")??"",/javascript/);assert.match(js.headers.get("cache-control")??"",/immutable/);
  const missing=await fetch(base+"/assets/not-a-real-asset.js");assert.equal(missing.status,404);
  const index=await fetch(base+"/index.html");assert.equal(index.headers.get("cache-control"),"no-store");
  const logo=await fetch(base+"/brand/mahalo-care-color.svg");assert.equal(logo.status,200);assert.match(logo.headers.get("content-type")??"",/svg/);
  console.log("PASS portable one-port production-mode smoke: React shell and deep routes, API isolation, anonymous auth denial, health, hashed asset caching, missing assets and official logo.");
}finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await pool.end();
}
