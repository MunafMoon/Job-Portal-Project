import 'dotenv/config';
import {createDatabasePool} from './database.js';
import {enabledSources,defaultSources} from './sources/index.js';
import {requester} from './http.js';
import {log} from './domain.js';
import {prepare} from './pipeline.js';
import {saveCandidate} from './repository.js';
import {parseOptions,positiveInteger} from './options.js';
import {visibleJobsSql} from './jobs-query.js';

let pool,db,runId,locked=false;
const results=[];
try{
 const options=parseOptions(process.argv.slice(2),{flags:['--dry-run','--require-target'],values:['--sources','--max-pages']});
 const dry=Boolean(options['--dry-run']);
 const maxAge=positiveInteger(process.env.MAX_JOB_AGE_DAYS,30,365),target=positiveInteger(process.env.TARGET_JOB_COUNT,200,1000000);
 const sources=enabledSources(options['--sources']||process.env.ENABLED_SOURCES||defaultSources);
 if(!dry){
  pool=createDatabasePool();db=await pool.connect();
  locked=(await db.query("select pg_try_advisory_lock(hashtext('fresherjobs-ingestion')) as locked")).rows[0].locked;
  if(!locked)throw new Error('INGESTION_ALREADY_RUNNING');
  runId=(await db.query("insert into ingestion_runs(status,target_count) values('running',$1) returning id",[target])).rows[0].id;
  await db.query('update sources set enabled=false where not(id=any($1::text[]))',[sources.map(source=>source.policy.id)]);
 }
 for(const source of sources){
  const started=new Date();
  if(db){
   await db.query(`insert into sources(id,name,enabled,terms_url,terms_checked_at,attribution,min_interval_ms)
    values($1,$2,true,$3,$4,$5,$6) on conflict(id) do update set name=excluded.name,enabled=true,
    terms_url=excluded.terms_url,terms_checked_at=excluded.terms_checked_at,attribution=excluded.attribution,min_interval_ms=excluded.min_interval_ms`,
    [source.policy.id,source.policy.name,source.policy.terms_url,source.policy.terms_checked_at,source.policy.attribution,source.policy.min_interval_ms]);
   const state=(await db.query('select last_attempt_at from sources where id=$1',[source.policy.id])).rows[0];
   if(state.last_attempt_at&&started-state.last_attempt_at<source.policy.min_interval_ms){
    const result={source:source.policy.id,status:'skipped',reason:'rate_limit_window'};results.push(result);log(result);continue;
   }
   await db.query('update sources set last_attempt_at=$2 where id=$1',[source.policy.id,started]);
  }
  try{
   const request=requester(source.policy,log,{beforeAttempt:async()=>{
    if(!db)return;
    const budget=await db.query(`update sources set request_count=case when request_day=(now() at time zone 'UTC')::date then request_count+1 else 1 end,
      request_day=(now() at time zone 'UTC')::date where id=$1 and (request_day is distinct from (now() at time zone 'UTC')::date or request_count<$2) returning request_count`,
      [source.policy.id,source.policy.max_requests_per_day]);
    if(!budget.rowCount)throw new Error('SOURCE_DAILY_BUDGET_EXHAUSTED');
   }});
   const batch=await source.fetchJobs({request,now:started,...(options['--max-pages']?{maxPages:positiveInteger(options['--max-pages'],45,100)}:{})});
   const prepared=prepare(batch.jobs,started,maxAge);
   const counts={eligible:0,review:0,rejected:0,inserted:0,updated:0,duplicate:prepared.repeated};
   if(db)await db.query('begin');
   try{
    for(const candidate of prepared.candidates){counts[candidate.decision.status]++;if(db)counts[await saveCandidate(db,candidate)]++;}
    if(db){
     await db.query('update sources set last_success_at=$2,last_error=$3 where id=$1',[source.policy.id,started,batch.complete===false?'SOURCE_PAGE_LIMIT_REACHED':null]);
     await db.query('commit');
    }
   }catch(error){if(db)await db.query('rollback');throw error;}
   const result={source:source.policy.id,status:batch.complete===false?'partial':'success',raw:batch.raw_count,invalid:batch.invalid_count+prepared.invalid,complete:batch.complete!==false,...counts};
   results.push(result);log(result);
  }catch(error){
   const message=/^(Source HTTP \d+|SOURCE_[A-Z_]+|REPEATED_SOURCE_CURSOR)$/.test(error.message||'')?error.message:'SOURCE_FETCH_VALIDATION_OR_PERSISTENCE_FAILED';
   const result={source:source.policy.id,status:'failed',error:message};results.push(result);log(result);
   if(db)await db.query('update sources set last_error=$2 where id=$1',[source.policy.id,message]);
  }
 }
 let unique=null;
 if(db)unique=Number((await db.query('select count(*) from jobs j where '+visibleJobsSql,[maxAge])).rows[0].count);
 const issues=results.some(row=>['failed','partial'].includes(row.status)),successes=results.some(row=>['success','partial'].includes(row.status));
 const status=issues?successes?'partial':'failed':successes?'success':'skipped';
 if(db)await db.query('update ingestion_runs set finished_at=now(),status=$2,source_results=$3,unique_eligible_count=$4,target_met=$5 where id=$1',[runId,status,JSON.stringify(results),unique,unique!==null&&unique>=target]);
 log({event:'ingestion_complete',dry_run:dry,status,unique_eligible_count:unique,target,target_met:unique!==null&&unique>=target});
 if(issues||(options['--require-target']&&(unique===null||unique<target)))process.exitCode=1;
}catch(error){
 log({event:'ingestion_failed',error_code:/^[A-Z_]+$/.test(error.message||'')?error.message:'CHECK_DATABASE_SCHEMA_AND_SERVER_CONFIG'});
 if(db&&runId)await db.query("update ingestion_runs set finished_at=now(),status='failed',source_results=$2 where id=$1",[runId,JSON.stringify(results)]).catch(()=>{});
 process.exitCode=1;
}finally{
 if(db){if(locked)await db.query("select pg_advisory_unlock(hashtext('fresherjobs-ingestion'))").catch(()=>{});db.release();}
 await pool?.end();
}
