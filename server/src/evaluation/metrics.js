import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ROLES} from '../tagging/schema.js';
export function sampleJobs(jobs,seed,size){
 return [...jobs].map(job=>({job,rank:createHash('sha256').update(seed+'\0'+job.id).digest('hex')})).sort((a,b)=>a.rank.localeCompare(b.rank)||a.job.id.localeCompare(b.job.id)).slice(0,size).map(row=>row.job);
}
const labelsSchema=z.array(z.object({id:z.string().uuid(),role:z.enum(ROLES),city:z.string().trim().min(1).max(80)}).strict());
export function validateReferenceLabels(rows,inputLabels){
 const labels=labelsSchema.parse(inputLabels),ids=new Set(rows.map(row=>row.job_id));
 if(!rows.length||labels.length!==rows.length||new Set(labels.map(label=>label.id)).size!==rows.length||labels.some(label=>!ids.has(label.id)))throw new Error('EVALUATION_LABEL_IDS_MISMATCH');
 return labels;
}
function city(value){
 const aliases={bangalore:'bengaluru',bombay:'mumbai',calcutta:'kolkata',gurgaon:'gurugram',madras:'chennai',cochin:'kochi',trivandrum:'thiruvananthapuram',mysore:'mysuru'};
 const normalized=value.trim().toLowerCase().replace(/\s+/g,' ');return aliases[normalized]||normalized;
}
export function calculateMetrics(rows,inputLabels,requests,{allowPartial=false,labelOrigin='unverified'}={}){
 const labels=validateReferenceLabels(rows,inputLabels),lookup=new Map(labels.map(label=>[label.id,label]));
 const evaluated=rows.filter(row=>row.predicted_role&&row.predicted_city);
 if(!evaluated.length||evaluated.length!==rows.length&&!allowPartial)throw new Error('EVALUATION_PREDICTIONS_MISSING');
 if(!['human','ai_assisted','unverified'].includes(labelOrigin))throw new Error('INVALID_LABEL_ORIGIN');
 let role=0,location=0,joint=0;
 for(const row of evaluated){const label=lookup.get(row.job_id),r=row.predicted_role===label.role,c=city(row.predicted_city)===city(label.city);role+=Number(r);location+=Number(c);joint+=Number(r&&c);}
 const known=requests.length>0&&requests.every(request=>request.cost_usd!==null&&request.input_tokens!==null&&request.output_tokens!==null&&!['started','usage_unknown','failed'].includes(request.status));
 const measured=requests.filter(row=>row.cost_usd!==null),observed=measured.length?measured.reduce((sum,row)=>sum+Number(row.cost_usd),0):null;
 const totalCost=known?requests.reduce((sum,row)=>sum+Number(row.cost_usd),0):null;
 const allKnownCity=labels.filter(label=>city(label.city)!=='unknown').length;
 const evaluatedKnown=evaluated.filter(row=>city(lookup.get(row.job_id).city)!=='unknown');
 const knownCityMatches=evaluatedKnown.filter(row=>city(row.predicted_city)===city(lookup.get(row.job_id).city)).length;
 const disagreements=evaluated.filter(row=>row.predicted_role!==lookup.get(row.job_id).role||city(row.predicted_city)!==city(lookup.get(row.job_id).city)).map(row=>({id:row.job_id,predicted_role:row.predicted_role,reference_role:lookup.get(row.job_id).role,predicted_city:row.predicted_city,reference_city:lookup.get(row.job_id).city}));
 const agreement={role_agreement:role/evaluated.length,city_agreement:location/evaluated.length,joint_agreement:joint/evaluated.length};
 return {
  sample_size:rows.length,evaluated_posts:evaluated.length,prediction_coverage:evaluated.length/rows.length,complete_predictions:evaluated.length===rows.length,
  city_label_distribution:{sample_known:allKnownCity,sample_unknown:labels.length-allKnownCity,evaluated_known:evaluatedKnown.length,evaluated_unknown:evaluated.length-evaluatedKnown.length,known_city_agreement:evaluatedKnown.length?knownCityMatches/evaluatedKnown.length:null},disagreements,
  reference_label_origin:labelOrigin,human_validated:labelOrigin==='human',...agreement,
  role_accuracy:labelOrigin==='human'?agreement.role_agreement:null,city_accuracy:labelOrigin==='human'?agreement.city_agreement:null,joint_accuracy:labelOrigin==='human'?agreement.joint_agreement:null,
  interpretation:labelOrigin==='human'?'Agreement against operator-attested human gold labels.':'Agreement against '+labelOrigin+' references; not independently human-validated accuracy.',
  input_tokens:requests.reduce((sum,row)=>sum+(row.input_tokens??0),0),output_tokens:requests.reduce((sum,row)=>sum+(row.output_tokens??0),0),requests:requests.length,
  usage_complete:known,unmeasured_requests:requests.filter(row=>row.cost_usd===null).length,observed_cost_usd:observed,observed_cost_per_1000_posts_usd:observed===null?null:observed/evaluated.length*1000,
  total_cost_usd:totalCost,cost_per_1000_posts_usd:totalCost===null?null:totalCost/evaluated.length*1000,
  model_breakdown:Object.entries(evaluated.reduce((groups,row)=>{const key=(row.provider||'unspecified')+'/'+(row.model||'unspecified');groups[key]=(groups[key]||0)+1;return groups;},{})).map(([model,posts])=>({model,posts})),
  cost_basis:'All measured evaluation request tokens times recorded rates, including invalid/repeated calls, divided by evaluated posts. Observed cost is a lower bound when any request has unknown usage; not an invoice.',
 };
}
