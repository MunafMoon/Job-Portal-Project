import 'dotenv/config';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import sodium from 'libsodium-wrappers';
import {parseOptions} from '../server/src/options.js';

try{
 const options=parseOptions(process.argv.slice(2),{flags:['--dispatch'],values:['--repo']});
 const repo=(options['--repo']||'').replace(/^https:\/\/github\.com\//,'').replace(/\.git$/,'').replace(/\/$/,'');
 if(!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error('INVALID_GITHUB_REPOSITORY');
 let token=process.env.GITHUB_TOKEN;
 if(!token){
  const git=process.platform==='win32'?'C:/Program Files/Git/cmd/git.exe':'git';
  const credential=spawnSync(git,['credential','fill'],{input:'protocol=https\nhost=github.com\npath='+repo+'.git\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},timeout:20000,windowsHide:true});
  if(credential.status!==0)throw new Error('GITHUB_AUTHENTICATION_REQUIRED');
  token=credential.stdout.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);
 }
 if(!token)throw new Error('GITHUB_AUTHENTICATION_REQUIRED');
 async function api(path,{method='GET',body,allow404=false}={}){
  const response=await fetch('https://api.github.com/repos/'+repo+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  if(response.status===404&&allow404)return null;
  if(!response.ok)throw new Error('GITHUB_HTTP_'+response.status);
  return response.status===204?null:response.json();
 }
 const repository=await api('');
 const key=await api('/actions/secrets/public-key');await sodium.ready;
 const values={DATABASE_URL:process.env.DATABASE_URL,DATABASE_CA_PEM:process.env.DATABASE_CA_FILE?await readFile(process.env.DATABASE_CA_FILE,'utf8'):process.env.DATABASE_CA_PEM,GEMINI_API_KEY:process.env.GEMINI_API_KEY,OPENAI_API_KEY:process.env.OPENAI_API_KEY};
 for(const [name,value]of Object.entries(values)){
  if(!value)continue;
  const encrypted=sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(value),sodium.from_base64(key.key,sodium.base64_variants.ORIGINAL)),sodium.base64_variants.ORIGINAL);
  await api('/actions/secrets/'+name,{method:'PUT',body:{encrypted_value:encrypted,key_id:key.key_id}});
  console.log(JSON.stringify({event:'github_secret_configured',name}));
 }
 const variables={ENABLED_SOURCES:process.env.ENABLED_SOURCES||'remotive,jobicy,remoteok,himalayas',LLM_PROVIDER:process.env.LLM_PROVIDER||'gemini',LLM_MODEL:process.env.LLM_MODEL||'gemini-3.5-flash-lite',TAGGING_MAX_COST_USD:process.env.TAGGING_MAX_COST_USD||'2'};
 for(const name of ['LLM_INPUT_USD_PER_MILLION','LLM_CACHED_INPUT_USD_PER_MILLION','LLM_OUTPUT_USD_PER_MILLION'])if(process.env[name])variables[name]=process.env[name];
 for(const [name,value]of Object.entries(variables)){
  const exists=await api('/actions/variables/'+name,{allow404:true});
  await api('/actions/variables'+(exists?'/'+name:''),{method:exists?'PATCH':'POST',body:{name,value}});
 }
 const secrets=await api('/actions/secrets');
 const required=['DATABASE_URL','DATABASE_CA_PEM',variables.LLM_PROVIDER==='gemini'?'GEMINI_API_KEY':'OPENAI_API_KEY'];
 const missing=required.filter(name=>!secrets.secrets.some(secret=>secret.name===name));
 console.log(JSON.stringify({event:'github_actions_configured',repository:repo,default_branch:repository.default_branch,missing_secrets:missing,schedule:'02:17 UTC / 07:47 India'}));
 if(options['--dispatch']){
  await api('/actions/workflows/ingest.yml/dispatches',{method:'POST',body:{ref:repository.default_branch}});
  console.log(JSON.stringify({event:'github_ingestion_dispatched',repository:repo}));
 }
 if(missing.length)process.exitCode=1;
}catch(error){console.log(JSON.stringify({event:'github_setup_failed',error_code:/^[A-Z0-9_]+$/.test(error.message||'')?error.message:'CHECK_REPOSITORY_ACCESS_AND_LOCAL_ENV'}));process.exitCode=1;}
