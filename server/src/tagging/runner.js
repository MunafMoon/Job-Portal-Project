import {callProvider,providerConfig} from './provider.js';
import {contentHash,validateTags,PROMPT_VERSION,systemPrompt,promptInputs} from './schema.js';
import {positiveInteger} from '../options.js';
import {log} from '../domain.js';
export async function tagJobs(db,{jobs,evaluationSet=null,env=process.env,providerCall=callProvider,logger=log}){
 const config=providerConfig(env),batchSize=positiveInteger(env.TAGGING_BATCH_SIZE,5,10);
 const budget=Number(env.TAGGING_MAX_COST_USD||2),delay=Number(env.TAGGING_DELAY_MS||6500);
 if(!Number.isFinite(budget)||budget<=0||!Number.isFinite(delay)||delay<0)throw new Error('INVALID_TAGGING_BUDGET_OR_DELAY');
 let spent=0,tagged=0,failed=0,requests=0,usageUnknown=false;
 for(let offset=0;offset<jobs.length;offset+=batchSize){
  const batch=jobs.slice(offset,offset+batchSize);
  const reserve=((Buffer.byteLength(systemPrompt+JSON.stringify(promptInputs(batch)))+1024)*config.pricing.input+8192*config.pricing.output)/1000000;
  if(spent+reserve>budget){logger({event:'tagging_budget_reached',tagged,remaining:jobs.length-offset,cost_usd:spent});failed+=jobs.length-offset;break;}
  if(requests&&delay)await new Promise(resolve=>setTimeout(resolve,delay));
  requests++;
  const requestId=(await db.query(`insert into tagging_requests(evaluation_set,provider,model,prompt_version,job_ids,status,pricing_snapshot)
    values($1,$2,$3,$4,$5,'started',$6) returning id`,[evaluationSet,config.provider,config.model,PROMPT_VERSION,JSON.stringify(batch.map(job=>job.id)),JSON.stringify(config.pricing)])).rows[0].id;
  let result;
  try{
   result=await providerCall(config,batch);
   // Persist measured usage before parsing model JSON or writing classifications.
   await db.query(`update tagging_requests set input_tokens=$2,cached_input_tokens=$3,output_tokens=$4,cost_usd=$5,finished_at=now(),status=$6 where id=$1`,
    [requestId,result.usage.input_tokens,result.usage.cached_input_tokens,result.usage.output_tokens,result.cost_usd,result.cost_usd===null?'usage_unknown':'invalid']);
   if(result.cost_usd!==null)spent+=result.cost_usd;
   logger({event:'tagging_usage',request_id:requestId,provider:config.provider,model:config.model,posts:batch.length,...result.usage,cost_usd:result.cost_usd,pricing_basis:config.pricing.basis});
   if(result.cost_usd===null)throw new Error('LLM_USAGE_MISSING');
   if(!result.complete)throw new Error('LLM_INCOMPLETE_RESPONSE');
   const tags=validateTags(JSON.parse(result.text),batch);
   await db.query('begin');
   try{
    let applied=0;
    for(const tag of tags){
     const job=batch.find(job=>job.id===tag.id);
     let updated;
     if(evaluationSet)updated=await db.query(`update tagging_evaluations set provider=$3,model=$4,prompt_version=$5,predicted_role=$6,predicted_city=$7,role_evidence=$8,city_evidence=$9 where evaluation_set=$1 and job_id=$2`,
      [evaluationSet,tag.id,config.provider,config.model,PROMPT_VERSION,tag.role,tag.city,tag.role_evidence,tag.city_evidence]);
     else updated=await db.query(`update jobs set role=$2,city=$3,tagging_content_hash=$4,tagging_provider=$5,tagging_model=$6,tagging_prompt_version=$7,tagged_at=now()
       where id=$1 and title=$8 and description=$9 and location_evidence=$10`,
       [tag.id,tag.role,tag.city,contentHash(job),config.provider,config.model,PROMPT_VERSION,job.title,job.description,job.location_evidence]);
     if(updated.rowCount===1)applied++;
    }
    await db.query("update tagging_requests set status='success',error_code=null where id=$1",[requestId]);
    await db.query('commit');tagged+=applied;failed+=tags.length-applied;
    if(applied<tags.length)logger({event:'tagging_input_changed',posts:tags.length-applied});
   }catch(error){await db.query('rollback');throw error;}
  }catch(error){
   if(!result||result.cost_usd===null)usageUnknown=true;
   const code=error.name==='TimeoutError'?'LLM_TIMEOUT':error instanceof TypeError&&!result?'LLM_NETWORK_ERROR':/^LLM_[A-Z0-9_]+$/.test(error.message||'')?error.message:'TAGGING_VALIDATION_OR_PERSISTENCE_FAILED';
   await db.query("update tagging_requests set status=case when cost_usd is not null then 'invalid' when finished_at is not null then 'usage_unknown' else 'failed' end,finished_at=coalesce(finished_at,now()),error_code=$2 where id=$1",[requestId,code]);
   logger({event:'tagging_batch_failed',request_id:requestId,error_code:code,posts:batch.length});failed+=batch.length;
   // Do not automatically repeat potentially billed requests. Configuration/quota/network failures stop this invocation.
   if(!result||result.cost_usd===null){failed+=jobs.length-offset-batch.length;break;}
  }
 }
 const summary={tagged,failed,requests,cost_usd:usageUnknown?null:spent,known_cost_usd:spent,usage_complete:!usageUnknown};
 logger({event:'tagging_complete',...summary});
 return summary;
}
