import {jsonSchema,systemPrompt,promptInputs} from './schema.js';
export function providerConfig(env=process.env){
 const provider=env.LLM_PROVIDER;
 if(!['gemini','openai'].includes(provider))throw new Error('LLM_PROVIDER_REQUIRED');
 const apiKey=provider==='gemini'?env.GEMINI_API_KEY:env.OPENAI_API_KEY;
 if(!apiKey||/YOUR|PASTE|\[/.test(apiKey))throw new Error('LLM_API_KEY_REQUIRED');
 const model=env.LLM_MODEL||(provider==='gemini'?'gemini-3.5-flash-lite':'');
 if(!/^[a-zA-Z0-9._-]+$/.test(model))throw new Error('LLM_MODEL_REQUIRED');
 const catalog=provider==='gemini'&&model==='gemini-3.5-flash-lite'?{input:0.3,cached:0.03,output:2.5,source:'https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite',checked_at:'2026-11-20',basis:'standard paid-tier list-price estimate; not invoice charges'}:null;
 function rate(key,fallback){const value=env[key];const number=value!==undefined&&value!==''?Number(value):fallback;if(!Number.isFinite(number)||number<0)throw new Error('LLM_PRICING_REQUIRED');return number;}
 const pricing={input:rate('LLM_INPUT_USD_PER_MILLION',catalog?.input),cached:rate('LLM_CACHED_INPUT_USD_PER_MILLION',catalog?.cached??catalog?.input),output:rate('LLM_OUTPUT_USD_PER_MILLION',catalog?.output),source:env.LLM_PRICING_REFERENCE||catalog?.source||'operator supplied rates',checked_at:catalog?.checked_at||new Date().toISOString().slice(0,10),basis:env.LLM_PRICING_BASIS||catalog?.basis||'operator supplied estimate'};
 return {provider,apiKey,model,pricing};
}
function nonnegative(value){return Number.isSafeInteger(value)&&value>=0?value:null;}
export function extractUsage(provider,body){
 let input,output,cached;
 if(provider==='gemini'){
  const usage=body.usageMetadata||{};input=nonnegative(usage.promptTokenCount);
  const candidates=nonnegative(usage.candidatesTokenCount),thoughts=nonnegative(usage.thoughtsTokenCount??0);
  output=candidates!==null&&thoughts!==null?candidates+thoughts:null;cached=nonnegative(usage.cachedContentTokenCount??0);
 }else{
  const usage=body.usage||{};input=nonnegative(usage.prompt_tokens);output=nonnegative(usage.completion_tokens);cached=nonnegative(usage.prompt_tokens_details?.cached_tokens??0);
 }
 return {input_tokens:input,output_tokens:output,cached_input_tokens:cached};
}
export function usageCost(usage,pricing){
 const {input_tokens:input,output_tokens:output,cached_input_tokens:cached}=usage;
 if([input,output,cached].some(value=>value===null)||cached>input)return null;
 return ((input-cached)*pricing.input+cached*pricing.cached+output*pricing.output)/1000000;
}
export async function callProvider(config,jobs,{fetcher=fetch}={}){
 const prompt=JSON.stringify(promptInputs(jobs));
 const body=config.provider==='gemini'?{
  systemInstruction:{parts:[{text:systemPrompt}]},contents:[{role:'user',parts:[{text:prompt}]}],
  generationConfig:{responseMimeType:'application/json',responseJsonSchema:jsonSchema,maxOutputTokens:8192},
 }:{
  model:config.model,store:false,messages:[{role:'system',content:systemPrompt},{role:'user',content:prompt}],
  response_format:{type:'json_schema',json_schema:{name:'job_tags',strict:true,schema:jsonSchema}},max_completion_tokens:8192,
 };
 const url=config.provider==='gemini'?'https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(config.model)+':generateContent':'https://api.openai.com/v1/chat/completions';
 const headers={'Content-Type':'application/json',...(config.provider==='gemini'?{'x-goog-api-key':config.apiKey}:{Authorization:'Bearer '+config.apiKey})};
 const response=await fetcher(url,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(60000)});
 if(!response.ok){await response.body?.cancel();throw new Error('LLM_HTTP_'+response.status);}
 const result=await response.json();
 const usage=extractUsage(config.provider,result);
 const text=config.provider==='gemini'?result.candidates?.[0]?.content?.parts?.filter(part=>!part.thought).map(part=>part.text||'').join(''):result.choices?.[0]?.message?.content;
 const complete=config.provider==='gemini'?result.candidates?.[0]?.finishReason==='STOP':result.choices?.[0]?.finish_reason==='stop';
 // Return usage even for refused, malformed or truncated content; validation happens after recording it.
 return {text,complete,usage,cost_usd:usageCost(usage,config.pricing)};
}
