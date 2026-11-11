import {AppError} from "./errors";
const roleLabel=(value:unknown)=>String(value??"").replaceAll("_"," ");
export function renderSecurityReportPdf(pdf:PDFKit.PDFDocument,value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value)||(value as Record<string,unknown>).schema!=="mahalo.security-report.v1")throw new AppError(409,"The governance report cannot be rendered from an invalid snapshot.");
  const body=value as Record<string,unknown>,summary=body.summary as Record<string,unknown>,zone=String(body.timeZone);
  const time=(v:unknown)=>v?new Intl.DateTimeFormat("en-US",{timeZone:zone,dateStyle:"medium",timeStyle:"short"}).format(new Date(String(v))):"Never signed in";
  const line=(text:string)=>pdf.moveDown(.4).font("MahaloSans").fontSize(9.5).fillColor("#323237").text(text,{lineGap:3});
  const heading=(text:string)=>pdf.moveDown(1).font("MahaloSerif").fontSize(13).fillColor("#181A1C").text(text);
  line(`Period: ${body.period}  |  Timezone: ${zone}`);
  line(`Captured: ${time(body.generatedAt)}  |  Source entries: ${summary.sourceRows}`);
  const scope=body.scopeLocations as string[];line(`Location scope: ${scope.length?scope.join(", "):"Whole practice"}`);
  if(body.includeVerification===true)line("Includes retained verification activity. This is not the default clinical-governance view.");
  if(body.kind==="access_review"){
    heading("Account review");
    line(`Active: ${summary.activeAccounts} · Invited: ${summary.invitedAccounts} · Inactive: ${summary.inactiveAccounts} · Patient/family portals: ${summary.portalAccounts}`);
    line(`Active prescribing/provider profiles without an NPI entered: ${summary.missingProviderNpis}`);
    const accounts=body.accounts as Record<string,unknown>[];
    for(const a of accounts.slice(0,200)){
      heading(`${a.name} · ${a.credential}`);
      line(`${a.email} · ${roleLabel(a.role)} · ${a.status}`);
      const sites=a.siteRoles as Record<string,string>,scopes=a.locationScopes as string[];
      line(Object.keys(sites).length?Object.entries(sites).map(([site,role])=>`${site}: ${roleLabel(role)}`).join(" · "):`Site access: ${scopes.length?scopes.join(", "):"All permitted practice locations"}`);
      line(`NPI: ${a.npi??"Not entered"} · Last sign-in: ${time(a.lastLoginAt)} · Active sessions at capture: ${a.activeSessions}`);
    }
    if(accounts.length>200)line(`The PDF summarizes the first 200 of ${accounts.length} accounts. The immutable JSON snapshot retains every captured account.`);
  }else if(body.kind==="audit_integrity"){
    heading("Captured-event integrity checkpoint");
    line(`Immutable audit events captured: ${summary.sourceRows}`);
    line(`Snapshot-chain SHA-256: ${summary.chainHead}`);
    line("The complete ordered event-ID/digest manifest is retained in the authenticated JSON snapshot.");
    line("Verification checks the captured events and the pinned private PDF. Newer/unlisted events are not part of this checkpoint. Keep an exported hash separately for an independent reference.");
    line("This checkpoint is not a claim of a continuous, externally anchored database ledger.");
  }else{
    heading("Emergency access review");
    line(`Accesses: ${summary.sourceRows} · Staff: ${summary.uniqueStaff} · Patients: ${summary.uniquePatients} · Active at capture: ${summary.activeAtCapture}`);
    const events=body.emergencyAccess as Record<string,unknown>[];
    if(!events.length)line("No matching emergency accesses were recorded for this week and location scope.");
    for(const e of events.slice(0,200)){
      heading(`${e.actorName}${e.credentialAtAccess?` · ${e.credentialAtAccess}`:""}`);
      line(`${e.patientName} · ${e.mrn} · ${e.location}`);
      line(`Opened: ${time(e.openedAt)} · Ends: ${time(e.expiresAt)} · Status at capture: ${e.status}`);
      if(e.endedAt)line(`Ended by the user: ${time(e.endedAt)}`);
      line(`Clinical reason: ${e.reason}`);
      line("Access scope: read only, one patient, maximum four hours.");
    }
    if(events.length>200)line(`The PDF summarizes the first 200 of ${events.length} accesses. The immutable JSON snapshot retains every captured access.`);
  }
  if(body.notice){heading("Review boundaries");line(String(body.notice));}
}
