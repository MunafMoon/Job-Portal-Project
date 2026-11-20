begin;
create extension if not exists pgcrypto;
create table sources (
  id text primary key, name text not null, enabled boolean not null default false,
  terms_url text not null, terms_checked_at date not null, attribution text not null,
  min_interval_ms bigint not null check (min_interval_ms >= 0),
  request_day date, request_count integer not null default 0 check(request_count >= 0),
  last_attempt_at timestamptz, last_success_at timestamptz, last_error text
);
create table ingestion_runs (
  id uuid primary key default gen_random_uuid(), started_at timestamptz not null default now(),
  finished_at timestamptz, status text not null check(status in ('running','success','partial','failed','skipped')),
  source_results jsonb not null default '[]', unique_eligible_count integer,
  target_count integer not null default 200, target_met boolean not null default false
);
create table jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null, company text not null, description text not null,
  original_url text not null, canonical_url text not null unique,
  source text not null references sources(id), source_job_id text not null,
  city text not null default 'Unknown', role text not null default 'Unknown',
  location_type text not null check(location_type in ('remote','hybrid','onsite','Unknown')),
  job_type text not null check(job_type in ('full_time','part_time','contract','freelance','internship','Unknown')),
  posted_at timestamptz, fetched_at timestamptz not null,
  location_evidence text not null, fingerprint text not null, description_hash text not null,
  eligibility text not null check(eligibility in ('eligible','review','rejected')),
  review_reasons jsonb not null default '[]', last_seen_at timestamptz not null,
  active boolean not null default true, unique(source, source_job_id)
);
-- A job can have many source identities without losing attribution or source-specific freshness.
create table job_sources (
  source text not null references sources(id), source_job_id text not null,
  job_id uuid not null references jobs(id), original_url text not null,
  canonical_url text not null, last_seen_at timestamptz not null,
  primary key(source, source_job_id), unique(source, canonical_url)
);
create index job_sources_job_idx on job_sources(job_id);
create index jobs_fingerprint_idx on jobs(fingerprint, description_hash);
create index jobs_filters_idx on jobs(eligibility, active, role, city, job_type, posted_at desc);
create index jobs_search_idx on jobs using gin(to_tsvector('english', title || ' ' || company || ' ' || description));
create index ingestion_runs_success_idx on ingestion_runs(finished_at desc) where status = 'success';
create table tagging_evaluations (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references jobs(id),
  evaluation_set uuid not null, seed text not null, content_hash text not null,
  provider text, model text, prompt_version text,
  predicted_role text, predicted_city text, labeled_role text, labeled_city text,
  input_tokens integer check(input_tokens >= 0), output_tokens integer check(output_tokens >= 0),
  cost_usd numeric(16,8) check(cost_usd >= 0), pricing_snapshot jsonb,
  created_at timestamptz not null default now(), unique(evaluation_set,job_id)
);
-- No browser access in phase 1. Backend uses a separate server-only database connection.
alter table sources enable row level security;
alter table jobs enable row level security;
alter table job_sources enable row level security;
alter table ingestion_runs enable row level security;
alter table tagging_evaluations enable row level security;
revoke all on sources,jobs,job_sources,ingestion_runs,tagging_evaluations from anon,authenticated;
commit;
