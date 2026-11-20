alter table tagging_evaluations add column if not exists label_origin text not null default 'unverified' check (label_origin in ('human','ai_assisted','unverified'));
alter table tagging_evaluations add column if not exists label_metadata jsonb;
create index if not exists tagging_evaluations_label_origin_idx on tagging_evaluations(evaluation_set,label_origin);
