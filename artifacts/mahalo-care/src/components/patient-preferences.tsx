import { useEffect, useState } from "react";
import { Bell, Radio } from "lucide-react";
import type { Patient, CareRecord } from "@workspace/api-client-react";
import { Btn, ConfirmButton, StatusPill } from "@/components/kit";
import { mStr, useAction } from "@/lib/api";
import { QUIET_DEFAULT, QuietHoursField, quietHoursError, type QuietHours } from "@/components/patient/quiet-hours";

export function PatientPreferences({patient,records}:{patient:Patient;records:CareRecord[]}) {
  const stored=patient.communicationPreferences??{email:true,sms:true,push:true};
  const sq:QuietHours=stored.quietHours?{enabled:!!stored.quietHours.enabled,start:stored.quietHours.start||QUIET_DEFAULT.start,end:stored.quietHours.end||QUIET_DEFAULT.end}:QUIET_DEFAULT;
  const [value,setValue]=useState({email:stored.email,sms:stored.sms,push:stored.push}),{run,pending}=useAction();
  const [quiet,setQuiet]=useState<QuietHours>(sq);
  useEffect(()=>setValue({email:stored.email,sms:stored.sms,push:stored.push}),[stored.email,stored.sms,stored.push,patient.id]);
  useEffect(()=>setQuiet(sq),[sq.enabled,sq.start,sq.end,patient.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const quietErr=quietHoursError(quiet);
  const devices=records.filter(r=>r.kind==="devices");
  const dirty=value.email!==stored.email||value.sms!==stored.sms||value.push!==stored.push||quiet.enabled!==sq.enabled||(quiet.enabled&&(quiet.start!==sq.start||quiet.end!==sq.end))||(!stored.quietHours&&quiet.enabled);
  return <div className="space-y-4">
    <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="patient-contact-heading">
      <h2 id="patient-contact-heading" className="flex items-center gap-2 font-serif text-xl"><Bell className="h-4 w-4" strokeWidth={1.5}/>Contact preferences</h2>
      <p className="mt-2 text-xs text-muted-foreground">Choose reminder channels. Secure messages remain available in this app. This local demo does not send email, SMS or push.</p>
      <div className="my-3 space-y-3">
        {(["email","sms","push"] as const).map(channel=><label key={channel} className="flex items-center justify-between gap-3 text-sm">
          <span>{channel==="email"?"Email reminders":channel==="sms"?"Text reminders":"Push reminders"}</span>
          <input type="checkbox" checked={value[channel]} onChange={e=>setValue({...value,[channel]:e.target.checked})} className="h-5 w-5 accent-[hsl(var(--primary))]" data-testid={`checkbox-patient-pref-${channel}`}/>
        </label>)}
        <QuietHoursField value={quiet} onChange={setQuiet} timezone={patient.timezone}/>
      </div>
      <Btn variant="primary" disabled={pending||!dirty||!!quietErr} onClick={()=>run({action:"updatePreferences",patientId:patient.id,payload:{...value,quietHours:quiet.enabled?{...quiet}:{enabled:false,start:quietHoursError({...sq,enabled:true})?QUIET_DEFAULT.start:sq.start,end:quietHoursError({...sq,enabled:true})?QUIET_DEFAULT.end:sq.end}}})} data-testid="button-save-patient-preferences">Save preferences</Btn>
    </section>
    <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="patient-device-heading">
      <h2 id="patient-device-heading" className="flex items-center gap-2 font-serif text-xl"><Radio className="h-4 w-4" strokeWidth={1.5}/>My devices</h2>
      {!devices.length?<p className="mt-2 text-sm text-muted-foreground">Your care team has not assigned a device.</p>:devices.map(device=><div key={device.id} className="border-b border-border py-3 last:border-0" data-testid={`patient-device-${device.id}`}>
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{device.title}<StatusPill value={device.status}/></div>
        <div className="mt-1 text-xs text-muted-foreground">{mStr(device,"serial")||"No serial recorded"} · {device.program||"Monitoring"}</div>
        {["assigned","active","setup_required"].includes(device.status)&&<div className="mt-2"><ConfirmButton label="Disconnect" title="Disconnect this device" desc="Future device events will no longer be processed. Your care team will receive a follow-up task. Existing readings stay in your record." reason reasonLabel="Why are you disconnecting?" confirmLabel="Disconnect device" variant="danger" pending={pending} onConfirm={(reason,close)=>run({action:"disconnectDevice",id:device.id,patientId:patient.id,reason},close)} testid={`button-p-disconnect-${device.id}`}/></div>}
      </div>)}
    </section>
  </div>;
}
