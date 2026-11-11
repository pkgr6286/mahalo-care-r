import assert from "node:assert/strict";
import { sortPatients } from "../artifacts/mahalo-care/src/lib/patient-sort.ts";
const rows = [
  {id:"a",firstName:"Amy",lastName:"Zulu",programs:["RPM","CCM"],location:"Smithtown",risk:"low",minutes:9,adherence:80,lastContact:"2026-11-09T23:00:00Z"},
  {id:"b",firstName:"Ben",lastName:"Adams",programs:["BHI"],location:"Garden City",risk:"critical",minutes:100,adherence:95,lastContact:"2026-11-10T01:00:00Z"},
  {id:"c",firstName:"Cal",lastName:"Baker",programs:[],location:null,risk:null,minutes:null,adherence:null,lastContact:null},
];
const expected = {patient:["b","c","a"],programs:["b","a","c"],location:["b","a","c"],risk:["a","b","c"],minutes:["a","b","c"],adherence:["a","b","c"],lastContact:["a","b","c"]};
for (const [key, ids] of Object.entries(expected)) {
  assert.deepEqual(sortPatients(rows,key,"asc").map(p=>p.id),ids,key+" ascending");
  const reverse = key==="patient" ? [...ids].reverse() : [ids[1],ids[0],ids[2]];
  assert.deepEqual(sortPatients(rows,key,"desc").map(p=>p.id),reverse,key+" descending");
}
assert.deepEqual(rows.map(p=>p.id),["a","b","c"],"sorting must not mutate query data");
const panel=Array.from({length:30},(_,i)=>({...rows[0],id:String(i),minutes:30-i}));
assert.deepEqual(sortPatients(panel,"minutes","asc").slice(0,25).map(p=>p.minutes),Array.from({length:25},(_,i)=>i+1),"sort before slicing pages");
assert.equal(sortPatients([{...rows[0],lastContact:"not-a-date"},rows[1]],"lastContact","desc")[1].id,"a");
console.log("PASS patient sorting: all seven columns in both directions, missing values, immutable input, and whole-panel pagination.");
