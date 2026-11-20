import 'dotenv/config';
import { createDatabasePool } from './database.js';
import { createJobsService } from './jobs-service.js';
import { createApp } from './app.js';
import { log } from './domain.js';

function integer(name, fallback, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error('Invalid server setting');
  return value;
}
let pool;
try {
  const port = integer('PORT',3001,65535);
  pool = createDatabasePool();
  pool.on('error',() => log({event:'database_pool_error',error_code:'DATABASE_UNAVAILABLE'}));
  const service = createJobsService(pool,{
    maxAgeDays:integer('MAX_JOB_AGE_DAYS',30,365),
    target:integer('TARGET_JOB_COUNT',200,1000000),
  });
  const app = createApp({service,logger:log});
  const server = app.listen(port,process.env.HOST || '127.0.0.1',() => log({event:'api_started',port}));
  server.on('error',async () => { log({event:'api_start_failed',error_code:'LISTEN_FAILED'}); await pool.end(); process.exitCode=1; });
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => process.exit(1),10000).unref();
    server.close(async () => { await pool.end(); clearTimeout(timer); });
  };
  process.on('SIGINT',shutdown);
  process.on('SIGTERM',shutdown);
} catch {
  log({event:'api_start_failed',error_code:'CHECK_SERVER_ENV_AND_CERTIFICATE'});
  await pool?.end();
  process.exitCode=1;
}
