import {it,expect,vi} from 'vitest';
import {himalayas} from '../src/sources/himalayas.js';
import {jobicy} from '../src/sources/jobicy.js';
import {remoteok} from '../src/sources/remoteok.js';
import {eligibility} from '../src/normalize.js';
const now=new Date('2026-11-20T10:00:00Z');
const job={guid:'https://himalayas.app/companies/fixture/jobs/intern',title:'Engineering Intern',companyName:'Synthetic Fixture',description:'Learn engineering with mentors.',applicationLink:'https://himalayas.app/companies/fixture/jobs/intern?utm_source=api',employmentType:'Intern',locationRestrictions:['India'],timezoneRestrictions:[5.5],seniority:['Entry-level'],pubDate:Math.floor(now.getTime()/1000),expiryDate:Math.floor(now.getTime()/1000)+86400};
it('paginates to an empty page and preserves applicationLink',async()=>{
 const request=vi.fn().mockResolvedValueOnce({jobs:[job],totalCount:900}).mockResolvedValueOnce({jobs:[],totalCount:900});
 const batch=await himalayas.fetchJobs({request,now});
 expect(batch.raw_count).toBe(1);expect(batch.complete).toBe(true);expect(request).toHaveBeenCalledTimes(2);
 expect(batch.jobs[0].original_url).toBe(job.applicationLink);
 expect(batch.jobs[0].city).toBe('Unknown');expect(eligibility(batch.jobs[0],now,30).status).toBe('eligible');
});
it('reports incomplete capped pagination',async()=>{
 const batch=await himalayas.fetchJobs({request:async()=>({jobs:[job],totalCount:900}),now,maxPages:1});
 expect(batch.raw_count).toBe(1);expect(batch.complete).toBe(false);
});
it('preserves timezone ambiguity and rejects expiry',async()=>{
 const request=vi.fn().mockResolvedValueOnce({jobs:[{...job,timezoneRestrictions:[-5]}]}).mockResolvedValueOnce({jobs:[]});
 const batch=await himalayas.fetchJobs({request,now});
 expect(eligibility(batch.jobs[0],now,30).status).toBe('review');
 expect(eligibility({...batch.jobs[0],expires_at:'2026-01-01T00:00:00Z'},now,30).reasons).toContain('expired');
});
it('rejects unreviewed request endpoints',()=>{
 expect(himalayas.policy.isAllowedUrl('https://evil.test/jobs/api/search')).toBe(false);
 expect(himalayas.policy.isAllowedUrl(himalayas.policy.endpoint+'?country=India&page=2')).toBe(true);
 expect(himalayas.policy.isAllowedUrl(himalayas.policy.endpoint+'?redirect=evil')).toBe(false);
});
it('uses a supported Jobicy location',async()=>{
 const request=vi.fn(async()=>({jobs:[],nextCursor:null}));
 expect((await jobicy.fetchJobs({request,now})).complete).toBe(true);
 expect(request.mock.calls[0][0]).toContain('geo=anywhere');
});
it('requires Remote OK legal metadata',async()=>{await expect(remoteok.fetchJobs({request:async()=>[],now})).rejects.toThrow('SOURCE_TERMS_NOTICE_MISSING');});

it('rejects general talent-pool posts and reviews misleading geography/mandatory experience',async()=>{
 const request=vi.fn().mockResolvedValueOnce({jobs:[job]}).mockResolvedValueOnce({jobs:[]});
 const candidate=(await himalayas.fetchJobs({request,now})).jobs[0];
 expect(eligibility({...candidate,title:'Submit your profile here'},now,30).status).toBe('rejected');
 expect(eligibility({...candidate,title:'Junior Assistant (LATAM)',location_evidence:'Worldwide'},now,30).status).toBe('review');
 expect(eligibility({...candidate,description:'At least 1 year of experience'},now,30).status).toBe('review');
});
