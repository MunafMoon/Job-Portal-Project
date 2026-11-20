import { useEffect, useRef, useState } from 'react';
import {
  Search, SlidersHorizontal, MapPin, BriefcaseBusiness, Globe2, X, ChevronDown,
  ChevronLeft, ChevronRight, RotateCw, Check, Layers3, Sprout, Compass,
  CircleHelp, AlertCircle, Clock3, Building2, ExternalLink, ShieldCheck,
} from 'lucide-react';
import { getJson, safeLink, typeLabel, cityLabel, displayDate } from './api.js';

const defaults = { keyword:'',role:'',city:'',type:'',location_type:'',page:1 };
function initialFilters() {
  const params = new URLSearchParams(window.location.search);
  return { ...defaults,
    ...Object.fromEntries(['keyword','role','city','type','location_type'].map(key=>[key,params.get(key)||''])),
    page:/^[1-9]\d*$/.test(params.get('page')||'') ? Math.min(Number(params.get('page')),10000) : 1,
  };
}
function Brand() {
  return <a className="brand" href="/" aria-label="FresherJobs AI home">
    <span className="brand-mark">f<span>.</span></span>
    <span>fresherjobs<span className="brand-ai">AI</span></span>
  </a>;
}
function Stat({icon:Icon,label,value,detail}) {
  return <div className="stat"><span className="stat-icon"><Icon size={20}/></span><div>
    <p className="stat-label">{label}</p><p className="stat-value">{value ?? '—'}</p><p className="stat-detail">{detail}</p>
  </div></div>;
}
function FilterSelect({label,value,onChange,children}) {
  return <label className="filter-field"><span>{label}</span><span className="select-wrap">
    <select value={value} onChange={event=>onChange(event.target.value)}>{children}</select><ChevronDown size={16} aria-hidden="true"/>
  </span></label>;
}
function JobCard({job}) {
  const [expanded,setExpanded] = useState(false);
  const link = safeLink(job.original_url);
  const initials = job.company.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  return <article className="job-card">
    <div className="job-card-top"><div className="company-avatar" aria-hidden="true">{initials}</div>
      <div className="company-meta"><p>{job.company}</p><span>Via <a href={safeLink(job.original_url) || undefined} target="_blank" rel="noopener noreferrer">{job.source_name}</a></span></div>
      <span className="entry-badge"><Sprout size={13}/> Fresher opportunity</span>
    </div>
    <h3>{job.title}</h3>
    <div className="job-tags">
      <span><MapPin size={15}/>{job.location_type==='remote' ? 'Remote' : cityLabel(job.city)}</span>
      <span><BriefcaseBusiness size={15}/>{typeLabel(job.job_type)}</span>
      {job.role!=='Unknown' && <span><Layers3 size={15}/>{job.role}</span>}
    </div>
    <p className="job-description">{job.description}</p>
    <div className="job-card-bottom">
      <span className="posted"><Clock3 size={14}/> Listed {new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short'}).format(new Date(job.posted_at))}</span>
      <div className="job-actions"><button className="text-button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded} aria-controls={'details-'+job.id}>{expanded?'Less detail':'Job details'}</button>
        {link && <a className="apply-button" href={link} target="_blank" rel="noopener noreferrer" aria-label={'View '+job.title+' on '+job.source_name}>View opportunity <ExternalLink size={14}/></a>}
      </div>
    </div>
    {expanded && <div className="job-full-details" id={'details-'+job.id}>
      <dl><div><dt>City</dt><dd>{cityLabel(job.city)}</dd></div>
        <div><dt>Location stated by source</dt><dd>{job.location_evidence || 'Not specified'}</dd></div>
        <div><dt>Role classification</dt><dd>{job.role==='Unknown'?'Not classified yet':job.role}</dd></div></dl>
      <p>{job.description}</p>
      <p className="detail-note">Confirm requirements and application availability on {job.source_name}. Listings are provided by the source; employer acceptance is not independently verified.</p>
    </div>}
  </article>;
}
function LoadingCards() {
  return <div className="loading-cards" aria-label="Loading opportunities" aria-busy="true">{[0,1,2].map(i=><div className="skeleton-card" key={i}><div className="skeleton short"/><div className="skeleton medium"/><div className="skeleton"/><div className="skeleton medium"/></div>)}</div>;
}
export default function App() {
  const [filters,setFilters] = useState(initialFilters);
  const [searchInput,setSearchInput] = useState(filters.keyword);
  const [jobs,setJobs] = useState(null);
  const [stats,setStats] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [statsError,setStatsError] = useState(false);
  const [reload,setReload] = useState(0);
  const [mobileFilters,setMobileFilters] = useState(false);
  const howItWorks = useRef(null);
  const reloadJobs = () => setReload(value=>value+1);
  const update = (key,value) => setFilters(current=>({...current,[key]:value,page:1}));
  const clear = () => {setFilters({...defaults});setSearchInput('');};
  const active = Object.entries(filters).filter(([key,value])=>key!=='page' && value);
  useEffect(()=>{
    const controller = new AbortController();
    setLoading(true);setError('');
    const params=new URLSearchParams();
    for (const [key,value] of Object.entries(filters)) if (value && !(key==='page' && value===1)) params.set(key,String(value));
    window.history.replaceState(null,'',window.location.pathname+(params.size?'?'+params.toString():'')+window.location.hash);
    params.set('limit','12');
    getJson('/api/jobs?'+params,controller.signal).then(data=>{
      setJobs(data);
      if(data.pagination.pages>0 && filters.page>data.pagination.pages) setFilters(current=>({...current,page:data.pagination.pages}));
    }).catch(cause=>{if(!controller.signal.aborted){setError(cause.message);setJobs(null);}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[filters,reload]);
  useEffect(()=>{
    const controller=new AbortController();
    getJson('/api/stats',controller.signal).then(data=>{setStats(data);setStatsError(false);})
      .catch(()=>{if(!controller.signal.aborted){setStats(null);setStatsError(true);}});
    return ()=>controller.abort();
  },[reload]);
  const failedSources=stats?.sources?.filter(source=>source.failed) || [];
  const page=jobs?.pagination;
  return <div className="site-shell">
    <a href="#jobs" className="skip-link">Skip to opportunities</a>
    <header className="site-header"><div className="header-inner"><Brand/>
      <nav aria-label="Main navigation"><a href="#jobs" className="nav-active">Find a job</a><button onClick={()=>howItWorks.current?.showModal()}>How it works</button><a href="#sources" className="nav-sources">Our sources</a></nav>
      <span className="header-note"><span className="india-colors" aria-hidden="true"/> Built for India's next generation</span>
    </div></header>
    <main>
      <section className="hero"><div className="hero-inner">
        <div className="hero-copy"><div className="eyebrow"><Sprout size={16}/> BIG AMBITIONS. FIRST OPPORTUNITIES.</div>
          <h1>Your first role.<br/><span>A real starting point.</span></h1>
          <p>Fresh out of college, full of possibilities. Find fresher jobs<br className="desktop-break"/> and internships open to candidates in India.</p>
          <form className="search-form" onSubmit={event=>{event.preventDefault();update('keyword',searchInput.trim());document.getElementById('jobs')?.scrollIntoView({behavior:'smooth',block:'start'});}}>
            <Search size={21} aria-hidden="true"/><label className="sr-only" htmlFor="job-search">Search title, company or keyword</label>
            <input id="job-search" value={searchInput} onChange={event=>setSearchInput(event.target.value)} placeholder="Job title, company or keyword" maxLength={120}/>
            <button type="submit">Find jobs</button>
          </form>
          <div className="popular"><span>A little inspiration:</span>{['Software','Data','Design','Internship'].map(label=><button key={label} onClick={()=>{if(label==='Internship'){update('type','internship');}else{setSearchInput(label);update('keyword',label);}}}>{label}</button>)}</div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/>
          <div className="art-note note-top"><span><Check size={16}/></span> Every beginning matters.</div>
          <div className="art-card"><span className="art-card-label">YOUR NEXT CHAPTER</span><div className="art-icon"><Sprout size={53} strokeWidth={1.4}/></div>
            <p>Small beginnings.<br/><strong>Big possibilities.</strong></p><div className="art-card-footer"><span>Curiosity looks good on you.</span><span className="art-star">✳</span></div></div>
          <div className="art-note note-bottom"><Compass size={18}/> A little direction. A lot of potential.</div>
          <span className="art-spark spark-one">✳</span><span className="art-spark spark-two">+</span>
        </div>
      </div></section>
      <div className="page-container">
        <section className="stats-strip" aria-label="Current job collection">
          <Stat icon={BriefcaseBusiness} label="Open opportunities" value={stats?.total_unique_jobs} detail="Unique, eligible listings"/>
          <Stat icon={Sprout} label="Internships" value={stats?.internships} detail="A place to get started"/>
          <Stat icon={Globe2} label="Remote opportunities" value={stats?.remote_jobs} detail="Open to candidates in India"/>
          <div className="refresh-stat"><span className="refresh-icon"><RotateCw size={17}/></span><div><p className="stat-label">Last successful refresh</p><p className="refresh-date">{stats ? displayDate(stats.last_successful_refresh) : 'Checking refresh status…'}</p><p className="stat-detail">Original sources. Real opportunities.</p></div></div>
        </section>
        {(statsError || failedSources.length>0) && <div className="notice" role="status"><AlertCircle size={18}/><span>{statsError?'Collection statistics are unavailable. Try reloading.':failedSources.map(s=>s.name).join(', ')+' could not refresh on the last attempt. Recently confirmed listings remain available.'}</span></div>}
        <section id="jobs" className="jobs-section">
          <div className="section-top"><div><p className="section-eyebrow">THE NEXT STEP IS YOURS</p><h2>Find your kind of opportunity<span>.</span></h2></div>
            <button className="reload-button" onClick={reloadJobs} disabled={loading}><RotateCw size={15} className={loading?'spinning':''}/> Reload jobs</button></div>
          <div className="jobs-layout">
            <aside className={'filters-panel '+(mobileFilters?'filters-open':'')} aria-label="Job filters">
              <div className="filters-heading"><h3><SlidersHorizontal size={18}/> Refine your search</h3><button onClick={clear} disabled={!active.length}>Reset</button></div>
              <FilterSelect label="Role" value={filters.role} onChange={value=>update('role',value)}><option value="">All roles</option>{(stats?.roles||[]).map(role=><option value={role} key={role}>{role==='Unknown'?'Not classified yet':role}</option>)}</FilterSelect>
              <FilterSelect label="City" value={filters.city} onChange={value=>update('city',value)}><option value="">All cities</option>{(stats?.cities||[]).map(city=><option value={city} key={city}>{cityLabel(city)}</option>)}</FilterSelect>
              {stats && !(stats.cities||[]).some(city=>city!=='Unknown') && <p className="city-filter-note">Current listings have no verified city labels. Remote eligibility does not identify a city.</p>}
              <FilterSelect label="Opportunity type" value={filters.type} onChange={value=>update('type',value)}><option value="">All types</option>{['full_time','part_time','internship','contract','freelance','Unknown'].map(type=><option value={type} key={type}>{typeLabel(type)}</option>)}</FilterSelect>
              <fieldset className="workplace-field"><legend>Workplace</legend>{[['','Any workplace'],['remote','Remote'],['hybrid','Hybrid'],['onsite','On-site']].map(([value,label])=><label key={value}><input type="radio" name="workplace" value={value} checked={filters.location_type===value} onChange={()=>update('location_type',value)}/>{label}</label>)}</fieldset>
              <div className="filter-footnote"><ShieldCheck size={20}/><p>Less noise. More clarity.<span>Only eligible listings appear here. Uncertain opportunities are held for review.</span></p></div>
            </aside>
            <div className="results-column">
              <div className="results-toolbar"><p aria-live="polite">{loading?'Finding your next opportunity…':error?'Could not load opportunities':<><strong>{page?.total??0}</strong> {(page?.total??0)===1?'opportunity':'opportunities'}{active.length?' matching your search':' to explore'}</>}</p><span className="sort-label">Newest first</span><button className="mobile-filter-button" aria-expanded={mobileFilters} onClick={()=>setMobileFilters(!mobileFilters)}><SlidersHorizontal size={16}/> Filters</button></div>
              {active.length>0 && <div className="active-filters">{active.map(([key,value])=><button key={key} onClick={()=>{update(key,'');if(key==='keyword')setSearchInput('');}}>{key==='type'?typeLabel(value):key==='city'?cityLabel(value):value}<X size={13}/><span className="sr-only">Remove {key} filter</span></button>)}</div>}
              {loading?<LoadingCards/>:error?<div className="empty-state error-state" role="alert"><AlertCircle size={34}/><h3>Let’s try that again.</h3><p>{error}</p><button className="primary-button" onClick={reloadJobs}>Try again</button></div>:!jobs?.jobs?.length?<div className="empty-state"><span className="empty-icon"><Search size={28}/></span><h3>{active.length?'A fresh search could be the start.':'Good beginnings take a little care.'}</h3><p>{active.length?'No opportunities match these filters. Try a broader keyword or clear your filters.':'There are no eligible, recently confirmed listings right now. We keep uncertain and stale listings out of your results.'}</p>{active.length>0 && <button className="primary-button" onClick={clear}>Clear filters</button>}<span className="empty-note">No placeholder jobs. Only real opportunities.</span></div>:<div className="job-list">{jobs.jobs.map(job=><JobCard job={job} key={job.id}/>)}</div>}
              {!loading && !error && page?.total>0 && <div className="pagination"><span>Showing {(page.page-1)*page.limit+1}–{Math.min(page.page*page.limit,page.total)} of {page.total}</span><div><button aria-label="Previous page" disabled={page.page<=1} onClick={()=>setFilters(current=>({...current,page:current.page-1}))}><ChevronLeft size={17}/></button><span>Page {page.page} of {page.pages}</span><button aria-label="Next page" disabled={page.page>=page.pages} onClick={()=>setFilters(current=>({...current,page:current.page+1}))}><ChevronRight size={17}/></button></div></div>}
              <div className="results-note"><CircleHelp size={16}/><p>Don’t see your fit yet? This is a growing collection. Quality and clear eligibility come first.</p></div>
            </div>
          </div>
        </section>
        <section className="sources-section" id="sources"><div><p className="section-eyebrow">A CLEARER WAY TO SEARCH</p><h2>Real listings. Original sources.</h2><p>We bring opportunities together, and always send you to the source to apply.</p></div>
          <div className="source-list">{stats?.sources?.length?stats.sources.map(source=><div className="source-pill" key={source.id}><Building2 size={18}/><span>{source.name}</span><span className={'source-state '+(source.failed?'source-failed':'')}>{source.failed?'Refresh issue':source.last_success_at?'Connected':'Awaiting refresh'}</span></div>):<p className="muted">Source information will appear when the API is available.</p>}</div>
        </section>
      </div>
    </main>
    <footer><div className="page-container footer-inner"><Brand/><p>A little help for your first big step.</p><span>Made for fresh starts in India.</span></div></footer>
    <dialog ref={howItWorks} className="how-dialog"><button className="dialog-close" aria-label="Close how it works" onClick={()=>howItWorks.current?.close()}><X size={21}/></button><span className="dialog-icon"><Sprout size={28}/></span><p className="section-eyebrow">YOUR SEARCH, WITH MORE CLARITY</p><h2>Good opportunities.<br/>A simpler starting point.</h2>
      <div className="how-step"><Search size={20}/><div><h3>Find a fit</h3><p>Search fresher jobs and internships, then narrow by role, city, type or workplace.</p></div></div>
      <div className="how-step"><ShieldCheck size={20}/><div><h3>Understand the listing</h3><p>We screen for India eligibility and fresher suitability. Uncertain records stay in review. Missing cities remain unspecified.</p></div></div>
      <div className="how-step"><ExternalLink size={20}/><div><h3>Apply at the original source</h3><p>View the full listing at its source and confirm requirements and availability before applying. No signup is needed to browse here.</p></div></div>
      <p className="dialog-note">Only eligible listings posted within {stats?.max_age_days??30} days and seen in a source within {stats?.freshness_hours??48} hours appear. City labels appear only when the listing states a clear work location.</p>
    </dialog>
  </div>;
}
