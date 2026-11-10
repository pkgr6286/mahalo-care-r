import { parse } from "csv-parse/sync";
import { CreatePatientBody } from "@workspace/api-zod";
import { patients } from "@workspace/db";
import { addRecord, id, writeAudit, type Store, type Actor } from "./store";
import { AppError } from "./errors";

export async function importPatients(s:Store,actor:Actor,payload:Record<string,unknown>) {
  if(payload.syntheticConfirmed!==true) throw new AppError(400,"Confirm that this file contains synthetic demo data only");
  if(typeof payload.csv!=="string"||payload.csv.length>300000) throw new AppError(400,"Provide a CSV no larger than 300 KB");
  let raw:Record<string,string>[];
  try {raw=parse(payload.csv,{columns:true,skip_empty_lines:true,trim:true,bom:true});}
  catch {throw new AppError(400,"CSV could not be parsed. Check headers, quotes and column counts.");}
  if(raw.length>500||!raw.length) throw new AppError(400,"CSV must contain between 1 and 500 patients");
  const errors:{row:number;message:string}[]=[];
  const existing=await s.select().from(patients);
  const prepared:({data:typeof patients.$inferInsert;duplicate:boolean})[]=[];
  const seen=new Set<string>();
  for(let i=0;i<raw.length;i++) {
    const row=raw[i]!;
    const parsed=CreatePatientBody.safeParse({...row,conditions:row.conditions?row.conditions.split("|"):[],medications:row.medications?row.medications.split("|"):[]});
    if(!parsed.success) {errors.push({row:i+2,message:parsed.error.issues.map(e=>`${e.path.join(".")}: ${e.message}`).join("; ")});continue;}
    const p=parsed.data;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(p.dob)||!Number.isFinite(Date.parse(p.dob))) {errors.push({row:i+2,message:"Invalid DOB; use YYYY-MM-DD"});continue;}
    if(!p.firstName.trim()||!p.lastName.trim()||!p.location.trim()) {errors.push({row:i+2,message:"Name and location cannot be blank"});continue;}
    const key=`${p.firstName.toLowerCase()}|${p.lastName.toLowerCase()}|${p.dob}`;
    const duplicate=seen.has(key)||existing.some(e=>e.firstName.toLowerCase()===p.firstName.toLowerCase()&&e.lastName.toLowerCase()===p.lastName.toLowerCase()&&e.dob===p.dob);
    seen.add(key);
    prepared.push({duplicate,data:{...p,id:id(),mrn:row.mrn||`MC-${id().slice(0,8).toUpperCase()}`}});
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
    metadata:{dryRun,rowCount:raw.length,validRows:prepared.length,newRows:prepared.filter(p=>!p.duplicate).length,duplicateRows:prepared.filter(p=>p.duplicate).length,errors,imported,synthetic:true},
  },actor);
}
