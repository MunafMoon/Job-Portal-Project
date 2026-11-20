import {z} from 'zod';
import {allowedQuery,dateValue,employmentType,normalizeItem} from './shared.js';
const endpoint='https://jobicy.com/api/jobs';
const raw=z.object({id:z.number().int(),url:z.string().url(),jobTitle:z.string(),companyName:z.string(),jobDescription:z.string(),jobGeo:z.string(),jobType:z.array(z.string()).optional(),jobLevel:z.string().optional(),pubDate:z.string().optional()});
export const jobicy={
 policy:{id:'jobicy',name:'Jobicy',endpoint,terms_url:'https://jobicy.com/jobs-rss-feed',terms_checked_at:'2026-11-20',attribution:'Credit Jobicy and preserve original Jobicy application URL. AI analysis and caching permitted.',min_interval_ms:3600000,min_request_interval_ms:1100,max_requests_per_day:60,timeout_ms:25000,max_attempts:3,isAllowedUrl:allowedQuery(endpoint,['count','geo','cursor'])},
 async fetchJobs({request,now,maxPages=30}){
  let cursor=null,raw_count=0,invalid_count=0;const jobs=[],seen=new Set();
  for(let page=0;page<maxPages;page++){
   const url=new URL(endpoint);url.searchParams.set('count','100');url.searchParams.set('geo','anywhere');
   if(cursor)url.searchParams.set('cursor',cursor);
   const body=z.object({jobs:z.array(z.unknown()),nextCursor:z.string().nullable().optional(),success:z.boolean().optional()}).parse(await request(url.href));
   if(body.success===false)throw new Error('SOURCE_REPORTED_FAILURE');
   raw_count+=body.jobs.length;
   for(const item of body.jobs){
    const parsed=raw.safeParse(item);if(!parsed.success){invalid_count++;continue;}const row=parsed.data;
    const result=normalizeItem({title:row.jobTitle,company:row.companyName,description:row.jobDescription,original_url:row.url,source:'jobicy',source_job_id:String(row.id),location_evidence:row.jobGeo,location_type:'remote',job_type:employmentType(row.jobType),posted_at:dateValue(row.pubDate),experience_evidence:row.jobLevel||''},now);
    if(result.success)jobs.push(result.data);else invalid_count++;
   }
   cursor=body.nextCursor??null;
   if(!cursor||!body.jobs.length)return {jobs,raw_count,invalid_count,complete:true};
   if(seen.has(cursor))throw new Error('REPEATED_SOURCE_CURSOR');seen.add(cursor);
  }
  return {jobs,raw_count,invalid_count,complete:false};
 }
};
