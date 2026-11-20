import {it,expect,vi} from 'vitest';
import {validateTags,cityCandidates,contentHash} from '../src/tagging/schema.js';
import {providerConfig,extractUsage,usageCost,callProvider} from '../src/tagging/provider.js';
import {tagJobs} from '../src/tagging/runner.js';
const job={id:'8f625366-d1ce-4a0f-820f-f3f37bed0001',title:'Junior Data Analyst',company:'Synthetic Fixture',description:'Analyze datasets with SQL. Job location: Pune.',location_evidence:'Pune, India',location_type:'hybrid',source:'fixture',original_url:'https://example.test/1'};
const tag={id:job.id,role:'Data & AI',city:'Pune',role_evidence:'Data Analyst',city_evidence:'Pune, India'};
const env={LLM_PROVIDER:'gemini',GEMINI_API_KEY:'synthetic-test-key',TAGGING_DELAY_MS:'0'};
it('accepts supported evidence and rejects extra fields',()=>{expect(validateTags({tags:[tag]},[job])).toEqual([tag]);expect(()=>validateTags({tags:[{...tag,extra:'bad'}]},[job])).toThrow();});
it.each([{city:'Mumbai',city_evidence:'Mumbai'},{city:'Remote',city_evidence:'remote'},{role:'Invented role'},{id:'another-job'},{role_evidence:'Made up quote'}])('rejects invalid classification %o',overrides=>{expect(()=>validateTags({tags:[{...tag,...overrides}]},[job])).toThrow();});
it('requires exact batch membership without duplicates',()=>{expect(()=>validateTags({tags:[tag,tag]},[job,{...job,id:'another'}])).toThrow();});
it('preserves Unknown without evidence',()=>{
 const missing={...job,description:'Analyze data',location_evidence:'India'};
 expect(cityCandidates(missing)).toEqual([]);
 expect(validateTags({tags:[{...tag,city:'Unknown',city_evidence:''}]},[missing])[0].city).toBe('Unknown');
 expect(()=>validateTags({tags:[tag]},[missing])).toThrow();
});
it('does not extract company headquarters',()=>{expect(cityCandidates({...job,title:'Analyst',location_evidence:'Worldwide',description:'Our headquarters are in Mumbai.'})).toEqual([]);});
it('rejects choosing one of several cities',()=>{expect(()=>validateTags({tags:[tag]},[{...job,location_evidence:'Pune or Mumbai'}])).toThrow();});
it('hashes snapshots reproducibly',()=>{expect(contentHash(job)).toBe(contentHash({...job}));expect(contentHash(job)).not.toBe(contentHash({...job,title:'Changed'}));});
it('counts thinking and cached tokens accurately',()=>{
 const usage=extractUsage('gemini',{usageMetadata:{promptTokenCount:1000,cachedContentTokenCount:200,candidatesTokenCount:100,thoughtsTokenCount:50}});
 expect(usage).toEqual({input_tokens:1000,cached_input_tokens:200,output_tokens:150});
 expect(usageCost(usage,{input:1,cached:0.1,output:2})).toBeCloseTo(.00112);
});
it('does not invent missing usage',()=>{expect(usageCost(extractUsage('gemini',{}),{input:1,cached:1,output:2})).toBeNull();});
it('reads OpenAI measured tokens',()=>{expect(extractUsage('openai',{usage:{prompt_tokens:123,completion_tokens:45,prompt_tokens_details:{cached_tokens:20}}})).toEqual({input_tokens:123,output_tokens:45,cached_input_tokens:20});});
it('requires keys and pricing for an unknown model',()=>{
 expect(()=>providerConfig({LLM_PROVIDER:'gemini'})).toThrow('LLM_API_KEY_REQUIRED');
 expect(()=>providerConfig({...env,LLM_MODEL:'different-model'})).toThrow('LLM_PRICING_REQUIRED');
});
it('uses structured output and header authentication',async()=>{
 const fetcher=vi.fn(async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({tags:[tag]})}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:5}}));
 const config=providerConfig(env),result=await callProvider(config,[job],{fetcher});
 const [url,options]=fetcher.mock.calls[0];expect(url).not.toContain(config.apiKey);
 expect(options.headers['x-goog-api-key']).toBe(config.apiKey);
 expect(JSON.parse(options.body).generationConfig.responseMimeType).toBe('application/json');
 expect(result.complete).toBe(true);expect(result.usage.input_tokens).toBe(10);
});
it('persists usage before rejecting a hallucinated city',async()=>{
 const queries=[],db={query:vi.fn(async(text,values)=>{queries.push({text,values});return {rows:[{id:'request-id'}],rowCount:1};})};
 const providerCall=vi.fn(async()=>({text:JSON.stringify({tags:[{...tag,city:'Invented'}]}),complete:true,usage:{input_tokens:50,cached_input_tokens:0,output_tokens:20},cost_usd:.001}));
 const result=await tagJobs(db,{jobs:[job],env,providerCall,logger:vi.fn()});
 expect(result.failed).toBe(1);
 expect(queries.some(query=>query.text.includes('set input_tokens='))).toBe(true);
 expect(queries.some(query=>query.text.startsWith('update jobs set'))).toBe(false);
});
it('stops before billing when budget is too small',async()=>{
 const providerCall=vi.fn(),db={query:vi.fn()};
 const result=await tagJobs(db,{jobs:[job],env:{...env,TAGGING_MAX_COST_USD:'0.0000001'},providerCall,logger:vi.fn()});
 expect(result.failed).toBe(1);expect(providerCall).not.toHaveBeenCalled();
});

it('rejects whitespace as role evidence',()=>{expect(()=>validateTags({tags:[{...tag,role_evidence:' '}]},[job])).toThrow();});
