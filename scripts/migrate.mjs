import 'dotenv/config';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createDatabasePool} from '../server/src/database.js';
const pool=createDatabasePool();
const db=await pool.connect();
try{
 await db.query("select pg_advisory_lock(hashtext('fresherjobs-migrations'))");
 await db.query('create table if not exists public.schema_migrations(name text primary key,checksum text not null,applied_at timestamptz not null default now(),baselined boolean not null default false)');
 await db.query('alter table public.schema_migrations enable row level security');
 await db.query('revoke all on public.schema_migrations from anon,authenticated');
 for(const name of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()){
  const sql=(await readFile('supabase/migrations/'+name,'utf8')).replace(/\r\n/g,'\n').replace(/^\uFEFF/,'');
  const checksum=createHash('sha256').update(sql).digest('hex');
  const prior=await db.query('select checksum from public.schema_migrations where name=$1',[name]);
  if(prior.rowCount){if(prior.rows[0].checksum!==checksum)throw new Error('MIGRATION_CHECKSUM_MISMATCH');continue;}
  let baselined=false;
  if(name==='001_initial.sql'){
   const existing=await db.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[])",[['jobs','sources','job_sources','ingestion_runs','tagging_evaluations']]);
   if(existing.rowCount){
    if(existing.rowCount!==5)throw new Error('PARTIAL_INITIAL_SCHEMA_REQUIRES_REVIEW');
    const expected={sources:['id','name','enabled','terms_url','terms_checked_at','attribution','min_interval_ms','request_day','request_count','last_attempt_at','last_success_at','last_error'],jobs:['id','title','company','description','original_url','canonical_url','source','source_job_id','city','role','location_type','job_type','posted_at','fetched_at','location_evidence','fingerprint','description_hash','eligibility','review_reasons','last_seen_at','active'],job_sources:['source','source_job_id','job_id','original_url','canonical_url','last_seen_at'],ingestion_runs:['id','started_at','finished_at','status','source_results','unique_eligible_count','target_count','target_met'],tagging_evaluations:['id','job_id','evaluation_set','seed','content_hash','provider','model','prompt_version','predicted_role','predicted_city','labeled_role','labeled_city','input_tokens','output_tokens','cost_usd','pricing_snapshot','created_at']};
    for(const [table,columns] of Object.entries(expected)){
     const actual=await db.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1",[table]);
     if(columns.some(column=>!actual.rows.some(row=>row.column_name===column)))throw new Error('INITIAL_SCHEMA_COLUMN_MISMATCH');
     const security=await db.query("select relrowsecurity from pg_class where oid=to_regclass($1)",['public.'+table]);
     if(!security.rows[0]?.relrowsecurity)throw new Error('INITIAL_SCHEMA_RLS_MISSING');
    }
    const indexes=await db.query("select indexname from pg_indexes where schemaname='public'");
    for(const index of ['sources_pkey','jobs_pkey','jobs_canonical_url_key','jobs_source_source_job_id_key','job_sources_pkey','job_sources_source_canonical_url_key','jobs_search_idx','jobs_filters_idx']){
     if(!indexes.rows.some(row=>row.indexname===index))throw new Error('INITIAL_SCHEMA_INDEX_MISSING');
    }
    baselined=true;
   }
  }
  await db.query('begin');
  try{
   if(!baselined)await db.query(sql.replace(/^\s*begin;|commit;\s*$/gmi,''));
   await db.query('insert into public.schema_migrations(name,checksum,baselined) values($1,$2,$3)',[name,checksum,baselined]);
   await db.query('commit');
  }catch(error){await db.query('rollback');throw error;}
  console.log(JSON.stringify({event:'migration_applied',name,baselined}));
 }
}catch(error){console.log(JSON.stringify({event:'migration_failed',code:/^[A-Z_]+$/.test(error.message)?error.message:'DATABASE_OR_SCHEMA_ERROR'}));process.exitCode=1;}
finally{await db.query("select pg_advisory_unlock(hashtext('fresherjobs-migrations'))").catch(()=>{});db.release();await pool.end();}
