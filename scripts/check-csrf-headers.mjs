import assert from "node:assert/strict";
import {sessionMutationHeaders} from "../artifacts/mahalo-care/src/lib/http.ts";
const previous=Object.getOwnPropertyDescriptor(globalThis,"document");
try{
  Object.defineProperty(globalThis,"document",{configurable:true,value:{cookie:"unrelated=value; mahalo_csrf=synthetic%2Dproof"}});
  const headers=sessionMutationHeaders(new Headers({"x-purpose":"regression","x-csrf-token":"stale"}));
  assert.equal(headers.get("x-csrf-token"),"synthetic-proof");
  assert.equal(headers.get("x-purpose"),"regression");
  assert.equal(headers.get("content-type"),"application/json");
  Object.defineProperty(globalThis,"document",{configurable:true,value:{cookie:""}});
  assert.equal(sessionMutationHeaders().has("x-csrf-token"),false);
  console.log("PASS shared browser-mutation header regression: current decoded proof, stale-proof replacement, caller-header preservation and empty-cookie handling.");
}finally{
  if(previous)Object.defineProperty(globalThis,"document",previous);else delete globalThis.document;
}
