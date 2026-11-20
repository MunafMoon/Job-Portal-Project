import {z} from 'zod';
import {dateValue,normalizeItem} from './shared.js';
const raw=z.object({id:z.union([z.string(),z.number()]),position:z.string(),company:z.string(),description:z.string(),url:z.string().url(),location:z.string().optional(),date:z.string().optional()});
export const remoteok={
 policy:{id:'remoteok',name:'Remote OK',endpoint:'https://remoteok.com/api',terms_url:'https://remoteok.com/api',terms_checked_at:'2026-11-20',attribution:'Mention Remote OK; follow link to original listing; no Remote OK logo.',min_interval_ms:72000000,min_request_interval_ms:31000,max_requests_per_day:3,timeout_ms:25000,max_attempts:3},
 async fetchJobs({request,now}){
  const body=z.array(z.unknown()).parse(await request(this.policy.endpoint));
  if(!body.some(row=>row&&typeof row==='object'&&typeof row.legal==='string'&&row.legal.includes('Remote OK')))throw new Error('SOURCE_TERMS_NOTICE_MISSING');
  let invalid_count=0;const jobs=[];const rows=body.filter(row=>row&&typeof row==='object'&&'id'in row);
  for(const item of rows){
   const parsed=raw.safeParse(item);if(!parsed.success){invalid_count++;continue;}const row=parsed.data;
   const result=normalizeItem({title:row.position,company:row.company,description:row.description,original_url:row.url,source:'remoteok',source_job_id:String(row.id),location_evidence:row.location||'',location_type:'remote',job_type:/\bintern(ship)?\b/i.test(row.position)?'internship':'Unknown',posted_at:dateValue(row.date)},now);
   if(result.success)jobs.push(result.data);else invalid_count++;
  }
  return {jobs,raw_count:rows.length,invalid_count,complete:true};
 }
};
