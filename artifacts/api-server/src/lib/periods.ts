export function localDay(timestamp:string|Date,timeZone:string) {
  return new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(timestamp));
}
export function rollingSupplyWindow(anchor:string,clock:Date,timeZone:string) {
  const start=new Date(`${/^\d{4}-\d{2}-\d{2}$/.test(anchor)?anchor:localDay(anchor,timeZone)}T00:00:00Z`).getTime();
  const today=new Date(`${localDay(clock,timeZone)}T00:00:00Z`).getTime();
  const elapsedDays=Math.max(0,Math.floor((today-start)/86400000));
  const complete=elapsedDays>=30;
  const index=complete?Math.floor(elapsedDays/30)-1:0;
  return {startDay:new Date(start+index*30*86400000).toISOString().slice(0,10),endDayExclusive:new Date(start+(index+1)*30*86400000).toISOString().slice(0,10),complete};
}
export function countDeviceDays(readings:{date:string}[],timeZone:string) {
  return new Set(readings.map(r=>localDay(r.date,timeZone))).size;
}
