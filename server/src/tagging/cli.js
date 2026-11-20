import 'dotenv/config';
import {createDatabasePool} from '../database.js';
import {parseOptions,positiveInteger} from '../options.js';
import {providerConfig} from './provider.js';
import {PROMPT_VERSION,contentHash} from './schema.js';
import {tagJobs} from './runner.js';
import {log} from '../domain.js';
let pool,db,locked=false;
try{
 const options=parseOptions(process.argv.slice(2),{flags:['--check-config'],values:['--limit','--scope']});
 const config=providerConfig();
 if(options['--check-config']){log({event:'tagging_config_valid',provider:config.provider,model:config.model,pricing:config.pricing});}
 else{
  pool=createDatabasePool();db=await pool.connect();
  locked=(await db.query("select pg_try_advisory_lock(hashtext('fresherjobs-tagging')) as locked")).rows[0].locked;
  if(!locked)throw new Error('TAGGING_ALREADY_RUNNING');
  const limit=positiveInteger(options['--limit'],200,5000);
  const scope=options['--scope']||'eligible';
  if(!['eligible','candidates'].includes(scope))throw new Error('INVALID_TAGGING_SCOPE');
  const maxAge=positiveInteger(process.env.MAX_JOB_AGE_DAYS,30,365);
  const rows=(await db.query(`select * from jobs where eligibility=any($6::text[]) and active=true
   and (expires_at is null or expires_at>now()) and posted_at>=now()-($1::int*interval '1 day')
   and (tagging_content_hash is null or tagging_provider is distinct from $2 or tagging_model is distinct from $3 or tagging_prompt_version is distinct from $4)
   order by (eligibility='eligible') desc,posted_at desc,id limit $5`,[maxAge,config.provider,config.model,PROMPT_VERSION,limit,scope==='eligible'?['eligible']:['eligible','review']])).rows;
  const jobs=rows.filter(job=>job.tagging_content_hash!==contentHash(job)||job.tagging_provider!==config.provider||job.tagging_model!==config.model||job.tagging_prompt_version!==PROMPT_VERSION);
  const result=await tagJobs(db,{jobs});if(result.failed)process.exitCode=1;
 }
}catch(error){log({event:'tagging_failed',error_code:/^[A-Z0-9_]+$/.test(error.message||'')?error.message:'CHECK_TAGGING_CONFIG_AND_DATABASE'});process.exitCode=1;}
finally{if(db){if(locked)await db.query("select pg_advisory_unlock(hashtext('fresherjobs-tagging'))").catch(()=>{});db.release();}await pool?.end();}
