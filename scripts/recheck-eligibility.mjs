import 'dotenv/config';
import {createDatabasePool} from '../server/src/database.js';
import {eligibility} from '../server/src/normalize.js';
import {positiveInteger} from '../server/src/options.js';
const pool=createDatabasePool();let db,locked=false;
try{
 db=await pool.connect();
 locked=(await db.query("select pg_try_advisory_lock(hashtext('fresherjobs-ingestion')) as locked")).rows[0].locked;
 if(!locked)throw new Error('INGESTION_ALREADY_RUNNING');
 const jobs=(await db.query('select * from jobs order by id')).rows,now=new Date(),age=positiveInteger(process.env.MAX_JOB_AGE_DAYS,30,365);
 let changed=0;const counts={eligible:0,review:0,rejected:0};
 await db.query('begin');
 try{
  for(const job of jobs){
   const decision=eligibility({...job,posted_at:job.posted_at?.toISOString()??null,expires_at:job.expires_at?.toISOString()??null},now,age);
   counts[decision.status]++;
   if(job.eligibility!==decision.status||JSON.stringify(job.review_reasons)!==JSON.stringify(decision.reasons)){
    await db.query('update jobs set eligibility=$2,review_reasons=$3 where id=$1',[job.id,decision.status,JSON.stringify(decision.reasons)]);changed++;
   }
  }
  await db.query('commit');
 }catch(error){await db.query('rollback');throw error;}
 console.log(JSON.stringify({event:'eligibility_rechecked',rules_version:'audited-v3',stored:jobs.length,changed,...counts}));
}catch{console.log(JSON.stringify({event:'eligibility_recheck_failed'}));process.exitCode=1;}
finally{if(db){if(locked)await db.query("select pg_advisory_unlock(hashtext('fresherjobs-ingestion'))").catch(()=>{});db.release();}await pool.end();}
