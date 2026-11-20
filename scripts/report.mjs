import 'dotenv/config';
import {writeFile,mkdir} from 'node:fs/promises';
import {createDatabasePool} from '../server/src/database.js';
import {visibleJobsSql} from '../server/src/jobs-query.js';
import {parseOptions,positiveInteger} from '../server/src/options.js';
const pool=createDatabasePool();
try{
 const options=parseOptions(process.argv.slice(2),{flags:['--require-complete'],values:['--out']});
 const maxAge=positiveInteger(process.env.MAX_JOB_AGE_DAYS,30,365),target=positiveInteger(process.env.TARGET_JOB_COUNT,200,1000000);
 const counts=(await pool.query(`select count(*)::int as stored, count(*) filter(where eligibility='review')::int as review,
  count(*) filter(where eligibility='rejected')::int as rejected,count(*) filter(where ${visibleJobsSql})::int as public_eligible,
  count(*) filter(where ${visibleJobsSql} and tagging_content_hash is not null)::int as public_tagged from jobs j`,[maxAge])).rows[0];
 const sources=(await pool.query('select id,name,enabled,last_attempt_at,last_success_at,last_error is not null as failed from sources order by id')).rows;
 const usage=(await pool.query("select count(*)::int as requests,count(*) filter(where status='success')::int as successful,count(*) filter(where cost_usd is null)::int as cost_unknown,coalesce(sum(input_tokens),0)::bigint as input_tokens,coalesce(sum(output_tokens),0)::bigint as output_tokens,sum(cost_usd) as known_estimated_cost_usd from tagging_requests")).rows[0];
 const evaluation=(await pool.query(`select s.id,s.sample_size,s.population_size,s.scope,count(e.job_id) filter(where e.labeled_role is not null and e.labeled_city is not null)::int as labeled,count(e.job_id) filter(where e.predicted_role is not null and e.predicted_city is not null)::int as predicted from evaluation_sets s left join tagging_evaluations e on e.evaluation_set=s.id group by s.id order by s.created_at desc`)).rows;
 const latest_run=(await pool.query('select status,source_results,finished_at from ingestion_runs order by started_at desc limit 1')).rows[0]||null;
 const acceptance={multiple_sources:sources.filter(row=>row.enabled&&row.last_success_at).length>=2,at_least_target_jobs:counts.public_eligible>=target,public_jobs_tagged:counts.public_eligible>0&&counts.public_eligible===counts.public_tagged,live_llm_usage:usage.successful>0,measured_usage_complete:usage.requests>0&&usage.cost_unknown===0,evaluation_50_manually_labeled:evaluation.some(row=>row.sample_size===50&&row.labeled===50&&row.predicted===50),no_latest_source_failures:!sources.some(row=>row.enabled&&row.failed)};
 const report={generated_at:new Date().toISOString(),target,counts,sources,usage,evaluation,latest_run,acceptance,complete:Object.values(acceptance).every(Boolean),note:'Active means source-confirmed within 48 hours and not explicitly expired; no independent employer availability claim. Costs use measured tokens and recorded rates.'};
 const output=JSON.stringify(report,null,2);
 if(options['--out']){await mkdir('artifacts',{recursive:true});await writeFile(options['--out'],output);}
 console.log(output);
 if(options['--require-complete']&&!report.complete)process.exitCode=1;
}catch{console.log(JSON.stringify({event:'report_failed',error_code:'CHECK_DATABASE_MIGRATIONS_AND_OPTIONS'}));process.exitCode=1;}
finally{await pool.end();}
