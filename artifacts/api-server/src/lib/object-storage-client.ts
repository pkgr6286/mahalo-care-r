import {Storage} from "@google-cloud/storage";

// Replit's provided sidecar credential setup; tokens are never handled by application routes.
const REPLIT_SIDECAR_ENDPOINT="http://127.0.0.1:1106";
export const objectStorageClient=new Storage({
  credentials:{
    audience:"replit",
    subject_token_type:"access_token",
    token_url:`${REPLIT_SIDECAR_ENDPOINT}/token`,
    type:"external_account",
    credential_source:{url:`${REPLIT_SIDECAR_ENDPOINT}/credential`,format:{type:"json",subject_token_field_name:"access_token"}},
    universe_domain:"googleapis.com",
  },
  projectId:"",
});
let gcp:Storage|undefined;
export function privateStorageClient() {
  const driver=process.env.STORAGE_DRIVER??"replit";
  if(driver==="replit")return objectStorageClient;
  if(driver==="gcp")return gcp??=new Storage(); // Cloud Run application-default service account.
  throw new Error("Unsupported private storage driver");
}
