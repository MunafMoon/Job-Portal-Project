alter table jobs add column if not exists expires_at timestamptz;
alter table jobs add column if not exists experience_evidence text not null default '';
alter table jobs add column if not exists tagging_content_hash text;
alter table jobs add column if not exists tagging_model text;
alter table jobs add column if not exists tagging_provider text;
alter table jobs add column if not exists tagging_prompt_version text;
alter table jobs add column if not exists tagged_at timestamptz;
create index if not exists jobs_tagging_idx on jobs(tagging_content_hash,tagged_at);
create table if not exists evaluation_sets (
  id uuid primary key default gen_random_uuid(), seed text not null,
  sample_size integer not null check(sample_size > 0), population_size integer not null,
  scope text not null, created_at timestamptz not null default now()
);
alter table tagging_evaluations add column if not exists snapshot jsonb;
alter table tagging_evaluations add column if not exists role_evidence text;
alter table tagging_evaluations add column if not exists city_evidence text;
create table if not exists tagging_requests (
  id uuid primary key default gen_random_uuid(),
  evaluation_set uuid references evaluation_sets(id),
  provider text not null, model text not null, prompt_version text not null,
  job_ids jsonb not null, status text not null check(status in ('started','success','invalid','failed','usage_unknown')),
  input_tokens integer, cached_input_tokens integer, output_tokens integer,
  cost_usd numeric(18,10), pricing_snapshot jsonb not null,
  error_code text, started_at timestamptz not null default now(), finished_at timestamptz
);
create index if not exists tagging_requests_set_idx on tagging_requests(evaluation_set,started_at);
alter table evaluation_sets enable row level security;
alter table tagging_requests enable row level security;
revoke all on evaluation_sets,tagging_requests from anon,authenticated;
