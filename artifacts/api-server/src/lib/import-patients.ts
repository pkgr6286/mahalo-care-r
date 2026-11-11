import { parse } from "csv-parse/sync";
import { CreatePatientBody } from "@workspace/api-zod";
import { patients, records, settings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { addRecord, id, writeAudit, type Store, type Actor } from "./store";
import { AppError } from "./errors";
import { authorize } from "./access";

export async function importPatients(s:Store,actor:Actor,payload:Record<string,unknown>) {
  authorize(actor,"admin");
  if(payload.syntheticConfirmed!==true) throw new AppError(400,"Confirm that this file contains synthetic demo data only");
  if(typeof payload.csv!=="string"||Buffer.byteLength(payload.csv,"utf8")>300000) throw new AppError(400,"Provide a CSV no larger than 300 KB");
  let raw:Record<string,string>[];
  const supported=new Set(["firstName","lastName","dob","location","mrn","email","phone","sex","conditions","medications","payer","careManager","timezone"]);
  try {raw=parse(payload.csv,{columns:(headers:string[])=>{
    if(new Set(headers).size!==headers.length)throw new AppError(400,"Duplicate CSV headers must be corrected before importing");
    const missing=["firstName","lastName","dob","location"].filter(h=>!headers.includes(h));
    if(missing.length)throw new AppError(400,`Missing required columns: ${missing.join(", ")}`);
    const unknown=headers.filter(h=>!supported.has(h));
    if(unknown.length)throw new AppError(400,`Unsupported columns: ${unknown.join(", ")}. Match columns in the import screen first.`);
    return headers;
  },skip_empty_lines:true,trim:true,bom:true});}
  catch (e) {if(e instanceof AppError)throw e;throw new AppError(400,"CSV could not be parsed. Check headers, quotes and column counts.");}
  if(raw.length>500||!raw.length) throw new AppError(400,"CSV must contain between 1 and 500 patients");
  const errors:{row:number;message:string}[]=[];
  const duplicates:{row:number;message:string}[]=[];
  const existing=await s.select().from(patients);
  const refs=await s.select().from(records).where(eq(records.status,"active"));
  const sites=new Map(refs.filter(r=>r.kind==="locations").map(r=>[r.title.toLowerCase(),r]));
  const managers=new Map(refs.filter(r=>r.kind==="staff").map(r=>[r.title.toLowerCase(),r.title]));
  const [practice]=await s.select().from(settings).where(eq(settings.id,"practice"));
  const prepared:({data:typeof patients.$inferInsert;duplicate:boolean})[]=[];
  const personKey=(p:{firstName:string;lastName:string;dob:string})=>`${p.firstName.trim().toLowerCase()}|${p.lastName.trim().toLowerCase()}|${p.dob}`;
  const byPerson=new Map(existing.map(p=>[personKey(p),p.mrn]));
  const byMrn=new Map(existing.map(p=>[p.mrn.toLowerCase(),personKey(p)]));
  for(let i=0;i<raw.length;i++) {
    const row=raw[i]!;
    const supplied=Object.fromEntries(Object.entries(row).filter(([,v])=>v!==""));
    const parsed=CreatePatientBody.safeParse({...supplied,conditions:row.conditions?row.conditions.split("|").map(s=>s.trim()).filter(Boolean):[],medications:row.medications?row.medications.split("|").map(s=>s.trim()).filter(Boolean):[]});
    if(!parsed.success) {errors.push({row:i+2,message:parsed.error.issues.map(e=>`${e.path.join(".")}: ${e.message}`).join("; ")});continue;}
    const p=parsed.data;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(p.dob)||!Number.isFinite(Date.parse(p.dob))||new Date(p.dob).toISOString().slice(0,10)!==p.dob||p.dob>new Date().toISOString().slice(0,10)) {errors.push({row:i+2,message:"DOB must be a valid past calendar date; use YYYY-MM-DD"});continue;}
    if(!p.firstName.trim()||!p.lastName.trim()||!p.location.trim()) {errors.push({row:i+2,message:"Name and location cannot be blank"});continue;}
    const site=sites.get(p.location.toLowerCase());
    if(!site){errors.push({row:i+2,message:"Location must match an active location in Admin → Locations. Create the location first, or choose a default location."});continue;}
    p.location=site.title;
    if(p.careManager&&p.careManager!=="Unassigned"){
      const manager=managers.get(p.careManager.toLowerCase());
      if(!manager){errors.push({row:i+2,message:"Care manager must match an active name in Admin → Staff directory, or be left unassigned."});continue;}
      p.careManager=manager;
    }
    p.timezone=p.timezone||(typeof site.metadata.timezone==="string"?site.metadata.timezone:undefined)||(typeof practice?.value.timezone==="string"?practice.value.timezone:"America/New_York");
    try{p.timezone=new Intl.DateTimeFormat("en",{timeZone:p.timezone}).resolvedOptions().timeZone;}
    catch{errors.push({row:i+2,message:"Timezone must be a valid IANA name, such as America/New_York."});continue;}
    if(p.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)){errors.push({row:i+2,message:"Email must be a valid email address, or left blank."});continue;}
    const mrn=row.mrn?.trim();
    if(mrn&&mrn.length>80){errors.push({row:i+2,message:"MRN must be 80 characters or fewer."});continue;}
    const key=personKey(p), previousMrn=byPerson.get(key), previousPerson=mrn?byMrn.get(mrn.toLowerCase()):undefined;
    if((previousPerson&&previousPerson!==key)||(previousMrn&&mrn&&previousMrn.toLowerCase()!==mrn.toLowerCase())){
      errors.push({row:i+2,message:"MRN conflicts with another patient or this patient's existing identifier. Review identity; no record will be overwritten."});continue;
    }
    const duplicate=previousMrn!==undefined;
    const assignedMrn=previousMrn||mrn||`MC-${id().slice(0,8).toUpperCase()}`;
    if(duplicate)duplicates.push({row:i+2,message:"Same name and birth date already exists in the panel or an earlier row. Existing details are unchanged."});
    byPerson.set(key,assignedMrn);byMrn.set(assignedMrn.toLowerCase(),key);
    prepared.push({duplicate,data:{...p,payer:p.payer||"",id:id(),mrn:assignedMrn}});
  }
  const dryRun=payload.dryRun!==false;
  if(!dryRun&&errors.length) throw new AppError(400,`Import rejected: ${errors.length} invalid rows. Run validation and correct the CSV first.`);
  let imported=0;
  if(!dryRun) for(const row of prepared) {
    if(row.duplicate) continue;
    await s.insert(patients).values(row.data);
    await writeAudit(s,actor,"import_patient",row.data.id,row.data.id);
    imported++;
  }
  return addRecord(s,"interactions",{
    title:dryRun?"Patient import validation":"Patient import completed",status:errors.length?"validation_errors":"completed",
    description:`${raw.length} rows; ${prepared.filter(p=>!p.duplicate).length} new; ${prepared.filter(p=>p.duplicate).length} duplicate; ${errors.length} errors; ${imported} imported.`,
    metadata:{dryRun,rowCount:raw.length,validRows:prepared.length,newRows:prepared.filter(p=>!p.duplicate).length,duplicateRows:prepared.filter(p=>p.duplicate).length,errors,duplicates,imported,synthetic:true},
  },actor);
}
