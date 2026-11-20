import {it,expect} from 'vitest';
import {sampleJobs,calculateMetrics} from '../src/evaluation/metrics.js';
const first='8f625366-d1ce-4a0f-820f-f3f37bed0001',second='8f625366-d1ce-4a0f-820f-f3f37bed0002';
const rows=[{job_id:first,predicted_role:'Data & AI',predicted_city:'Bengaluru'},{job_id:second,predicted_role:'Software Engineering',predicted_city:'Unknown'}];
const labels=[{id:first,role:'Data & AI',city:'Bangalore'},{id:second,role:'Operations',city:'Unknown'}];
const requests=[{status:'success',input_tokens:100,output_tokens:50,cost_usd:'0.002'}];
it('reproduces seeded samples regardless of population order',()=>{
 const jobs=Array.from({length:100},(_,index)=>({id:String(index)})),sample=sampleJobs(jobs,'seed',50);
 expect(sample).toHaveLength(50);expect(new Set(sample.map(row=>row.id)).size).toBe(50);
 expect(sample).toEqual(sampleJobs([...jobs].reverse(),'seed',50));
 expect(sample).not.toEqual(sampleJobs(jobs,'other',50));
});
it('scores role, city, joint and usage-normalized cost',()=>{
 const report=calculateMetrics(rows,labels,requests,{labelOrigin:'human'});
 expect(report.role_accuracy).toBe(.5);expect(report.city_accuracy).toBe(1);expect(report.joint_accuracy).toBe(.5);
 expect(report.cost_per_1000_posts_usd).toBe(1);
});
it('refuses missing, duplicate or blank gold labels',()=>{
 for(const bad of [[labels[0]],[labels[0],labels[0]],[{...labels[0],role:null},labels[1]]])expect(()=>calculateMetrics(rows,bad,requests)).toThrow();
});
it('does not replace unknown usage with zero cost',()=>{
 const report=calculateMetrics(rows,labels,[{status:'failed',input_tokens:null,output_tokens:null,cost_usd:null}]);
 expect(report.cost_per_1000_posts_usd).toBeNull();expect(report.usage_complete).toBe(false);
});
it('includes invalid-response costs',()=>{
 const report=calculateMetrics(rows,labels,[...requests,{status:'invalid',input_tokens:50,output_tokens:20,cost_usd:'0.001'}]);
 expect(report.total_cost_usd).toBe(.003);expect(report.cost_per_1000_posts_usd).toBe(1.5);
});
it('requires real predictions',()=>{expect(()=>calculateMetrics([{...rows[0],predicted_role:null},rows[1]],labels,requests)).toThrow();});
