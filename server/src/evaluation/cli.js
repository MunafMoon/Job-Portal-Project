import 'dotenv/config';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {createDatabasePool} from '../database.js';
import {parseOptions,positiveInteger} from '../options.js';
import {snapshot,contentHash,ROLES} from '../tagging/schema.js';
import {tagJobs} from '../tagging/runner.js';
import {sampleJobs,calculateMetrics} from './metrics.js';
import {log} from '../domain.js';
let pool,db,locked=false;
try{
 const [command,...args]=process.argv.slice(2);
 const options=parseOptions(args,{flags:['--allow-small-sample'],values:['--seed','--size','--scope','--out','--set','--labels']});
 if(!['export','tag','score'].includes(command))throw new Error('USE_EXPORT_TAG_OR_SCORE');
 pool=createDatabasePool();db=await pool.connect();
 if(command==='export'){
  const size=positiveInteger(options['--size'],50,500),seed=options['--seed']||'fresherjobs-ai-v1',scope=options['--scope']||'candidates';
  if(seed.length>128||!['eligible','candidates'].includes(scope))throw new Error('INVALID_EVALUATION_SCOPE_OR_SEED');
  const maxAge=positiveInteger(process.env.MAX_JOB_AGE_DAYS,30,365);
  const population=(await db.query(`select * from jobs where active=true and eligibility=any($1::text[]) and posted_at>=now()-($2::int*interval '1 day')
    and (expires_at is null or expires_at>now()) and exists(select 1 from job_sources js where js.job_id=jobs.id and js.last_seen_at>=now()-interval '48 hours') order by id`,
    [scope==='eligible'?['eligible']:['eligible','review'],maxAge])).rows;
  if(!population.length||population.length<size&&!options['--allow-small-sample'])throw new Error('INSUFFICIENT_JOBS_FOR_REQUESTED_SAMPLE');
  const selected=sampleJobs(population,seed,size);
  const out=path.resolve(options['--out']||'artifacts/evaluation');
  if(!out.startsWith(process.cwd()+path.sep))throw new Error('EVALUATION_OUTPUT_MUST_BE_IN_WORKSPACE');
  await mkdir(path.dirname(out),{recursive:true});await mkdir(out); // Never overwrite manual labels.
  await db.query('begin');
  let set;
  try{
   set=(await db.query('insert into evaluation_sets(seed,sample_size,population_size,scope) values($1,$2,$3,$4) returning id',[seed,selected.length,population.length,scope])).rows[0].id;
   for(const job of selected)await db.query(`insert into tagging_evaluations(job_id,evaluation_set,seed,content_hash,snapshot) values($1,$2,$3,$4,$5)`,[job.id,set,seed,contentHash(job),JSON.stringify(snapshot(job))]);
   await db.query('commit');
  }catch(error){await db.query('rollback');throw error;}
  await writeFile(path.join(out,'manifest.json'),JSON.stringify({evaluation_set:set,seed,sample_size:selected.length,requested_size:size,population_size:population.length,scope,roles:ROLES,job_ids:selected.map(row=>row.id),content_hashes:selected.map(row=>({id:row.id,hash:contentHash(row)}))},null,2));
  await writeFile(path.join(out,'jobs.json'),JSON.stringify(selected.map(snapshot),null,2));
  await writeFile(path.join(out,'labels.json'),JSON.stringify(selected.map(job=>({id:job.id,role:null,city:null})),null,2));
  await writeFile(path.join(out,'INSTRUCTIONS.txt'),'Manually read jobs.json. Fill every null in labels.json with a role from manifest.json and a city, using Unknown if missing/ambiguous. Do not inspect model predictions first. Do not use an LLM as the manual gold labels. Keep IDs unchanged. Snapshots are frozen in the database; rerunning export with the same seed and population selects the same IDs.\n');
  log({event:'evaluation_exported',evaluation_set:set,sample_size:selected.length,population_size:population.length,scope,out:path.relative(process.cwd(),out),fifty_job_sample:selected.length===50});
 }else{
  const set=z.string().uuid().parse(options['--set']);
  const rows=(await db.query('select * from tagging_evaluations where evaluation_set=$1 order by job_id',[set])).rows;
  if(!rows.length)throw new Error('EVALUATION_SET_NOT_FOUND');
  if(command==='tag'){
   locked=(await db.query("select pg_try_advisory_lock(hashtext('fresherjobs-tagging')) as locked")).rows[0].locked;
   if(!locked)throw new Error('TAGGING_ALREADY_RUNNING');
   const jobs=rows.filter(row=>!row.predicted_role||!row.predicted_city).map(row=>row.snapshot);
   const result=await tagJobs(db,{jobs,evaluationSet:set});if(result.failed)process.exitCode=1;
  }else{
   if(!options['--labels'])throw new Error('MANUAL_LABEL_FILE_REQUIRED');
   const labels=JSON.parse(await readFile(options['--labels'],'utf8'));
   const requests=(await db.query('select status,input_tokens,output_tokens,cost_usd from tagging_requests where evaluation_set=$1',[set])).rows;
   const report={evaluation_set:set,...calculateMetrics(rows,labels,requests)};
   await db.query('begin');
   try{for(const label of labels)await db.query('update tagging_evaluations set labeled_role=$3,labeled_city=$4 where evaluation_set=$1 and job_id=$2',[set,label.id,label.role,label.city]);await db.query('commit');}
   catch(error){await db.query('rollback');throw error;}
   if(options['--out'])await writeFile(options['--out'],JSON.stringify(report,null,2),{flag:'wx'});
   console.log(JSON.stringify({event:'evaluation_scored',...report}));
   if(!report.usage_complete)process.exitCode=1;
  }
 }
}catch(error){
 const code=/^[A-Z_]+$/.test(error.message||'')?error.message:error.code==='EEXIST'?'OUTPUT_EXISTS_PRESERVE_MANUAL_LABELS':'CHECK_EVALUATION_LABELS_CONFIG_AND_DATABASE';
 log({event:'evaluation_failed',error_code:code});process.exitCode=1;
}finally{if(db){if(locked)await db.query("select pg_advisory_unlock(hashtext('fresherjobs-tagging'))").catch(()=>{});db.release();}await pool?.end();}
