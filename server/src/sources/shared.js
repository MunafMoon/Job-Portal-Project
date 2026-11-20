import {jobSchema} from '../domain.js';
import {plain} from '../normalize.js';
export function allowedQuery(endpoint,keys){
 const base=new URL(endpoint);
 return value=>{
  try{const url=new URL(value);return url.origin===base.origin&&url.pathname===base.pathname&&!url.username&&!url.password&&!url.hash&&[...url.searchParams.keys()].every(key=>keys.includes(key));}catch{return false;}
 };
}
export function dateValue(value){
 if(value===undefined||value===null||value==='')return null;
 const date=typeof value==='number'?new Date(value*1000):new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:value+'Z');
 return Number.isFinite(date.getTime())?date.toISOString():null;
}
export function normalizeItem(input,now){
 return jobSchema.safeParse({...input,title:plain(input.title),company:plain(input.company),
  description:plain(input.description),location_evidence:plain(input.location_evidence||''),
  role:'Unknown',city:'Unknown',fetched_at:now.toISOString()});
}
export function employmentType(value){
 const types=Array.isArray(value)?value:[value];
 const mapped=types.map(item=>({'full-time':'full_time','full time':'full_time','full_time':'full_time','part-time':'part_time','part time':'part_time','contractor':'contract','contract':'contract','freelance':'freelance','intern':'internship','internship':'internship'}[String(item).toLowerCase()])).filter(Boolean);
 return new Set(mapped).size===1?mapped[0]:'Unknown';
}
