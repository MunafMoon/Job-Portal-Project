import {z} from 'zod';
import {allowedQuery,dateValue,employmentType,normalizeItem} from './shared.js';
const endpoint='https://himalayas.app/jobs/api/search';
const raw=z.object({guid:z.string().url(),title:z.string(),companyName:z.string(),description:z.string(),applicationLink:z.string().url(),employmentType:z.string(),locationRestrictions:z.array(z.string()).optional(),timezoneRestrictions:z.array(z.union([z.string(),z.number()])).optional(),seniority:z.array(z.string()).optional(),pubDate:z.number(),expiryDate:z.number()});
export const himalayas={
 policy:{id:'himalayas',name:'Himalayas',endpoint,terms_url:'https://himalayas.app/terms#terms-and-conditions-for-api-users',terms_checked_at:'2026-11-20',attribution:'Show Himalayas source link; preserve applicationLink unchanged; no onward syndication; exclude expired jobs.',min_interval_ms:72000000,min_request_interval_ms:6500,max_requests_per_day:90,timeout_ms:25000,max_attempts:3,isAllowedUrl:allowedQuery(endpoint,['country','seniority','sort','page'])},
 async fetchJobs({request,now,maxPages=45}){
  const jobs=[];let raw_count=0,invalid_count=0;
  for(let page=1;page<=maxPages;page++){
   const url=new URL(endpoint);url.searchParams.set('country','India');url.searchParams.set('seniority','Entry-level');url.searchParams.set('sort','recent');url.searchParams.set('page',String(page));
   const body=z.object({jobs:z.array(z.unknown())}).parse(await request(url.href));
   raw_count+=body.jobs.length;
   for(const item of body.jobs){
    const parsed=raw.safeParse(item);if(!parsed.success){invalid_count++;continue;}const row=parsed.data;
    const countries=row.locationRestrictions;
    const timezoneOK=row.timezoneRestrictions?.some(value=>Number(value)===5.5);
    let location=countries?countries.length?countries.join(', '):'Worldwide':'';
    if(!timezoneOK)location='India timezone eligibility unconfirmed: '+location;
    const result=normalizeItem({title:row.title,company:row.companyName,description:row.description,original_url:row.applicationLink,source:'himalayas',source_job_id:row.guid,location_evidence:location,location_type:'remote',job_type:employmentType(row.employmentType),posted_at:dateValue(row.pubDate),expires_at:dateValue(row.expiryDate),experience_evidence:row.seniority?.join(', ')||''},now);
    if(result.success)jobs.push(result.data);else invalid_count++;
   }
   // Provider totalCount is an estimate: stop only at an empty page, never pad to that total.
   if(!body.jobs.length)return {jobs,raw_count,invalid_count,complete:true};
  }
  return {jobs,raw_count,invalid_count,complete:false};
 }
};
