import {AppError} from "./errors";

export const locationRoles=["clinical_admin","billing_provider","care_manager","behavioral_care_manager","psychiatric_consultant","therapist","front_desk","billing","read_only"] as const;
export function validateSiteRoles(role:string,map:Record<string,string>) {
  if(Object.keys(map).length>100)throw new AppError(400,"Limit site assignments to 100 locations.");
  if(Object.keys(map).length&&["admin","patient","caregiver"].includes(role))throw new AppError(400,"Practice administrators, patients and family caregivers do not use staff site roles.");
  if(Object.entries(map).some(([site,r])=>!site.trim()||!locationRoles.includes(r as typeof locationRoles[number])))throw new AppError(400,"Choose a supported staff role for each assigned location.");
}
/** Never union privileges from different sites. Existing unmapped accounts retain their scopes. */
export function staffContext(u:{role:string;locationScopes:string[];siteRoles:Record<string,string>},requested?:string|null) {
  const sites=Object.keys(u.siteRoles??{}).sort();
  if(!sites.length)return {role:u.role,locationScopes:u.locationScopes,activeLocation:null};
  validateSiteRoles(u.role,u.siteRoles);
  const activeLocation=requested&&sites.includes(requested)?requested:sites[0]!;
  return {role:u.siteRoles[activeLocation]!,locationScopes:[activeLocation],activeLocation};
}
export function staffRoleAt(u:{role:string;locationScopes?:string[];siteRoles?:Record<string,string>},location:string):string|null {
  const map=u.siteRoles??{};
  if(Object.keys(map).length){validateSiteRoles(u.role,map);return Object.hasOwn(map,location)?map[location]!:null;}
  return u.role==="admin"||!u.locationScopes?.length||u.locationScopes.includes(location)?u.role:null;
}
export function canUseEmergencyAccess(u:{role:string;credential:string;locationScopes?:string[];siteRoles?:Record<string,string>}) {
  const map=u.siteRoles??{},mapped=Object.keys(map).length>0;
  const roles=mapped?Object.values(map):[u.role];
  return u.role!=="admin"&&(mapped||!!u.locationScopes?.length)&&
    ["MD","DO","NP","PA","RN","LPN","PT","OT","SLP","LCSW","psych_consultant"].includes(u.credential)&&
    roles.some(r=>["clinical_admin","billing_provider","care_manager","behavioral_care_manager","psychiatric_consultant","therapist"].includes(r));
}
/** NPI checksum/format only; this does not verify licensure or ownership. */
export function checkedNpi(value:string|null|undefined) {
  if(value===undefined||value===null||!value.trim())return null;
  const npi=value.trim();
  if(!/^[12][0-9]{9}$/.test(npi))throw new AppError(400,"Enter a 10-digit individual or organization NPI beginning with 1 or 2.");
  const digits=`80840${npi}`;
  let sum=0;
  for(let i=digits.length-1,offset=0;i>=0;i--,offset++){
    let d=Number(digits[i]);if(offset%2){d*=2;if(d>9)d-=9;}sum+=d;
  }
  if(sum%10)throw new AppError(400,"The NPI check digit is invalid.");
  return npi;
}
