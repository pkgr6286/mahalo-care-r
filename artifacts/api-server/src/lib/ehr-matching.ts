import {createHash} from "node:crypto";
import type {PatientRow} from "@workspace/db";
import type {EhrIdentity} from "./ehr-adapter";
import {AppError} from "./errors";
type LocalIdentity=Pick<PatientRow,"id"|"mrn"|"firstName"|"lastName"|"dob">;
export type MatchConfirmation={confirmed:true;candidateId:string;matchHash:string;reason:string};
export function ehrMatchHash(p:LocalIdentity,c:EhrIdentity) {
  return createHash("sha256").update(JSON.stringify({local:{id:p.id,mrn:p.mrn,firstName:p.firstName,lastName:p.lastName,dob:p.dob},
    candidate:{id:c.id,mrn:c.mrn??"",firstName:c.firstName,lastName:c.lastName,dob:c.dob}})).digest("hex");
}
export function resolveFixtureEhrMatch(p:LocalIdentity,c:EhrIdentity,confirmation?:MatchConfirmation,prior?:Record<string,unknown>,forcePrompt=false) {
  // This is a per-patient synthetic driver, not an unrestricted external patient-directory search.
  if(c.id!==`fixture-${p.id}`)throw new AppError(409,"The fixture identity belongs to another patient");
  const hash=ehrMatchHash(p,c);
  if(confirmation&&(confirmation.candidateId!==c.id||confirmation.matchHash!==hash))throw new AppError(409,"The identities changed; compare the current demographics before confirming");
  if(p.dob!==c.dob){
    if(confirmation)throw new AppError(409,"Different dates of birth cannot be manually overridden");
    return {status:"match_blocked",hash,matchedBy:null,confirmed:false,reusePrior:false} as const;
  }
  if(confirmation)return {status:"matched",hash,matchedBy:"confirmed_name_dob",confirmed:true,reusePrior:false} as const;
  if(!forcePrompt&&c.mrn&&c.mrn===p.mrn)return {status:"matched",hash,matchedBy:"mrn",confirmed:false,reusePrior:false} as const;
  if(!forcePrompt&&prior?.matchHash===hash&&typeof prior.confirmedById==="string")return {status:"matched",hash,matchedBy:"confirmed_name_dob",confirmed:true,reusePrior:true} as const;
  return {status:"confirmation_required",hash,matchedBy:null,confirmed:false,reusePrior:false} as const;
}
