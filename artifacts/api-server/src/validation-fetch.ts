import { randomUUID } from "node:crypto";
const run=process.argv.find(a=>a.startsWith("--validation-run="))?.split("=")[1]??randomUUID();
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
  const url=new URL(typeof input==="string"?input:input instanceof URL?input:input.url);
  if(url.hostname==="localhost"&&url.pathname.startsWith("/api/")) {
    const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
    headers.set("x-mahalo-validation-run",run);
    return originalFetch(input,{...init,headers});
  }
  return originalFetch(input,init);
};
