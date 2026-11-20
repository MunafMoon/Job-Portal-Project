import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ROLES} from '../tagging/schema.js';
export function sampleJobs(jobs,seed,size){
 return [...jobs].map(job=>({job,rank:createHash('sha256').update(seed+'\0'+job.id).digest('hex')})).sort((a,b)=>a.rank.localeCompare(b.rank)||a.job.id.localeCompare(b.job.id)).slice(0,size).map(row=>row.job);
}
const labelsSchema=z.array(z.object({id:z.string().uuid(),role:z.enum(ROLES),city:z.string().trim().min(1).max(80)}).strict());
function city(value){
 const aliases={bangalore:'bengaluru',bombay:'mumbai',calcutta:'kolkata',gurgaon:'gurugram',madras:'chennai',cochin:'kochi',trivandrum:'thiruvananthapuram',mysore:'mysuru'};
 const normalized=value.trim().toLowerCase().replace(/\s+/g,' ');return aliases[normalized]||normalized;
}
export function calculateMetrics(rows,inputLabels,requests){
 const labels=labelsSchema.parse(inputLabels),ids=new Set(rows.map(row=>row.job_id));
 if(labels.length!==rows.length||new Set(labels.map(label=>label.id)).size!==rows.length||labels.some(label=>!ids.has(label.id)))throw new Error('EVALUATION_LABEL_IDS_MISMATCH');
 if(!rows.length||rows.some(row=>!row.predicted_role||!row.predicted_city))throw new Error('EVALUATION_PREDICTIONS_MISSING');
 const lookup=new Map(labels.map(label=>[label.id,label]));
 let role=0,location=0,joint=0;
 for(const row of rows){const label=lookup.get(row.job_id);const r=row.predicted_role===label.role,c=city(row.predicted_city)===city(label.city);role+=Number(r);location+=Number(c);joint+=Number(r&&c);}
 const known=requests.length>0&&requests.every(request=>request.cost_usd!==null&&request.input_tokens!==null&&request.output_tokens!==null&&!['started','usage_unknown','failed'].includes(request.status));
 const measured=requests.filter(row=>row.cost_usd!==null);
 const observed=measured.length?measured.reduce((sum,row)=>sum+Number(row.cost_usd),0):null;
 const totalCost=known?requests.reduce((sum,row)=>sum+Number(row.cost_usd),0):null;
 return {sample_size:rows.length,role_accuracy:role/rows.length,city_accuracy:location/rows.length,joint_accuracy:joint/rows.length,
  input_tokens:requests.reduce((sum,row)=>sum+(row.input_tokens??0),0),output_tokens:requests.reduce((sum,row)=>sum+(row.output_tokens??0),0),requests:requests.length,
  usage_complete:known,unmeasured_requests:requests.filter(row=>row.cost_usd===null).length,observed_cost_usd:observed,observed_cost_per_1000_posts_usd:observed===null?null:observed/rows.length*1000,total_cost_usd:totalCost,cost_per_1000_posts_usd:totalCost===null?null:totalCost/rows.length*1000,
  model_breakdown:Object.entries(rows.reduce((groups,row)=>{const key=(row.provider||'unspecified')+'/'+(row.model||'unspecified');groups[key]=(groups[key]||0)+1;return groups;},{})).map(([model,posts])=>({model,posts})),
  cost_basis:'Measured provider tokens times recorded rates, including invalid/repeated evaluation calls; not an invoice.'};
}
