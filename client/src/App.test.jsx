// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from './App.jsx';
import { safeLink } from './api.js';
const stats={total_unique_jobs:1,internships:0,remote_jobs:1,last_successful_refresh:'2026-11-20T09:37:47Z',roles:['Unknown'],cities:['Unknown'],sources:[{id:'remotive',name:'Remotive',failed:false,last_success_at:'2026-11-20T09:37:47Z'}]};
const job={id:'fixture-id',company:'Synthetic Test Company',title:'Junior Developer',description:'Synthetic test fixture, not live job data.',original_url:'https://example.test/job/1',source_name:'Remotive',source:'remotive',posted_at:'2026-11-20T00:00:00Z',city:'Unknown',role:'Unknown',location_type:'remote',job_type:'full_time',location_evidence:'Worldwide'};
let fetcher;
beforeEach(()=>{
  window.history.replaceState(null,'','/');
  fetcher=vi.fn(async path=>({ok:true,json:async()=>String(path).startsWith('/api/stats')?stats:{jobs:[job],pagination:{page:1,limit:12,total:1,pages:1}}}));
  vi.stubGlobal('fetch',fetcher);
  HTMLElement.prototype.scrollIntoView=vi.fn();
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('renders real API data, source attribution and an original-source link',async()=>{
  render(<App/>);
  expect(await screen.findByRole('heading',{name:'Junior Developer'})).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Remotive',exact:true})).toHaveAttribute('href',job.original_url);
  expect(screen.getByRole('link',{name:'View Junior Developer on Remotive'})).toHaveAttribute('href',job.original_url);
  fireEvent.click(screen.getByRole('button',{name:'Job details'}));
  expect(screen.getByText('City not specified',{selector:'dd'})).toBeInTheDocument();
});
it('searches and applies filters through the API instead of filtering fabricated cards',async()=>{
  render(<App/>);
  await screen.findByRole('heading',{name:'Junior Developer'});
  fireEvent.change(screen.getByLabelText('Search title, company or keyword'),{target:{value:'Data'}});
  fireEvent.click(screen.getByRole('button',{name:'Find jobs'}));
  await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>String(url).includes('keyword=Data'))).toBe(true));
  fireEvent.change(screen.getByLabelText('Opportunity type'),{target:{value:'internship'}});
  await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>String(url).includes('type=internship'))).toBe(true));
});
it('shows an honest empty state instead of placeholder jobs',async()=>{
  fetcher.mockImplementation(async path=>({ok:true,json:async()=>String(path).startsWith('/api/stats')?{...stats,total_unique_jobs:0}:{jobs:[],pagination:{page:1,limit:12,total:0,pages:0}}}));
  render(<App/>);
  expect(await screen.findByText('Good beginnings take a little care.')).toBeInTheDocument();
  expect(screen.queryByRole('heading',{name:'Junior Developer'})).not.toBeInTheDocument();
});
it('shows a recoverable API error',async()=>{
  fetcher.mockImplementation(async path=>{if(String(path).startsWith('/api/jobs')) throw new Error('API offline');return {ok:true,json:async()=>stats};});
  render(<App/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('API offline');
  expect(screen.getByRole('button',{name:'Try again'})).toBeInTheDocument();
});
it('shows source refresh failures without hiding successfully loaded jobs',async()=>{
  fetcher.mockImplementation(async path=>({ok:true,json:async()=>String(path).startsWith('/api/stats')?{...stats,sources:[{...stats.sources[0],failed:true}]}:{jobs:[job],pagination:{page:1,limit:12,total:1,pages:1}}}));
  render(<App/>);
  await screen.findByRole('heading',{name:'Junior Developer'});
  expect(await screen.findByText(/could not refresh on the last attempt/)).toBeInTheDocument();
});
it('rejects executable and credential-bearing application URLs',()=>{
  expect(safeLink('javascript:alert(1)')).toBeNull();
  expect(safeLink('https://user:secret@example.test')).toBeNull();
  expect(safeLink('https://example.test/jobs/1')).toBe('https://example.test/jobs/1');
});
