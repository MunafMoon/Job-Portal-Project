import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { filtersSchema, buildJobsQuery } from '../src/jobs-query.js';
import { createJobsService } from '../src/jobs-service.js';
function setup() {
  const service={
    jobs:vi.fn(async filters=>({jobs:[],pagination:{page:filters.page,limit:filters.limit,total:0,pages:0}})),
    stats:vi.fn(async()=>({total_unique_jobs:0,roles:[],cities:[],sources:[]})),
    health:vi.fn(async()=>({status:'ok',database:'connected'})),
  };
  return {service,app:createApp({service,staticDirectory:null})};
}
describe('jobs API',()=>{
  it('applies defaults and forwards valid filters',async()=>{
    const {app,service}=setup();
    const response=await request(app).get('/api/jobs?keyword=engineer&role=Unknown&city=Unknown&type=internship&location_type=remote&page=2&limit=5');
    expect(response.status).toBe(200);
    expect(service.jobs).toHaveBeenCalledWith({keyword:'engineer',role:'Unknown',city:'Unknown',type:'internship',location_type:'remote',page:2,limit:5});
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it.each(['page=0','page=-1','page=1.5','page=10001','limit=101','limit=0','type=invalid','location_type=worldwide','city=a&city=b','keyword='+ 'x'.repeat(121),'unexpected=field'])('rejects invalid input: %s',async query=>{
    const {app,service}=setup();
    expect((await request(app).get('/api/jobs?'+query)).status).toBe(400);
    expect(service.jobs).not.toHaveBeenCalled();
  });
  it('returns honest zero results and empty pagination',async()=>{
    const {app}=setup();
    const response=await request(app).get('/api/jobs');
    expect(response.body).toMatchObject({jobs:[],pagination:{total:0,pages:0,page:1,limit:12}});
  });
  it('does not leak database failures to clients',async()=>{
    const {app,service}=setup();
    service.jobs.mockRejectedValue(new Error('secret connection string'));
    const response=await request(app).get('/api/jobs');
    expect(response.status).toBe(503);
    expect(response.text).not.toContain('secret');
  });
  it('provides database readiness and fails clearly on disconnect',async()=>{
    const {app,service}=setup();
    expect((await request(app).get('/api/health')).body.status).toBe('ok');
    service.health.mockRejectedValue(new Error('private'));
    expect((await request(app).get('/api/health')).status).toBe(503);
  });
  it('serves stats and returns JSON for unknown API routes',async()=>{
    const {app}=setup();
    expect((await request(app).get('/api/stats')).body.total_unique_jobs).toBe(0);
    expect((await request(app).get('/api/private')).status).toBe(404);
  });
});
describe('parameterized database filtering',()=>{
  it('binds search input and escapes wildcard characters',()=>{
    const filters=filtersSchema.parse({keyword:"%_' OR 1=1 --",role:'Developer',city:'Pune',type:'internship',location_type:'remote',page:'3',limit:'10'});
    const query=buildJobsQuery(filters);
    expect(query.text).not.toContain(filters.keyword);
    expect(query.text).toContain('ilike $2');
    expect(query.values).toEqual([30,"%\\%\\_' OR 1=1 --%",'Developer','Pune','internship','remote',10,20]);
    expect(query.text).toContain("j.eligibility='eligible'");
    expect(query.text).toContain("interval '48 hours'");
    expect(query.text).toContain('j.job_type=');
  });
  it('returns a real total even when the requested page is empty',async()=>{
    const pool={query:vi.fn(async()=>({rows:[{total:25,jobs:[]}]}))};
    const result=await createJobsService(pool).jobs(filtersSchema.parse({page:'4',limit:'10'}));
    expect(result).toEqual({jobs:[],pagination:{page:4,limit:10,total:25,pages:3}});
    expect(pool.query.mock.calls[0][0]).toContain('order by posted_at desc,id asc');
  });
  it('includes freshness-aware facets and refresh history in statistics',async()=>{
    const pool={query:vi.fn(async()=>({rows:[{total_unique_jobs:1,internships:0,remote_jobs:1,roles:['Unknown'],cities:['Unknown'],sources:[]}]}))};
    const stats=await createJobsService(pool).stats();
    expect(stats.total_unique_jobs).toBe(1);
    expect(stats.target_count).toBe(200);
    expect(pool.query.mock.calls[0][0]).toContain("status='success'");
  });
});
