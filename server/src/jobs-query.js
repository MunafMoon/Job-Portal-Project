import { z } from 'zod';

const page = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(10000));
const limit = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(100));
const optionalText = z.string().trim().max(120).default('');
export const filtersSchema = z.object({
  page: page.default(1), limit: limit.default(12),
  keyword: optionalText, role: optionalText, city: optionalText,
  type: z.enum(['', 'full_time', 'part_time', 'contract', 'freelance', 'internship', 'Unknown']).default(''),
  location_type: z.enum(['', 'remote', 'hybrid', 'onsite', 'Unknown']).default(''),
}).strict();

export const visibleJobsSql = `j.eligibility='eligible' and j.active=true
  and j.posted_at >= now() - ($1::int * interval '1 day')
  and (j.expires_at is null or j.expires_at>now())
  and j.posted_at <= now() + interval '1 day'
  and exists(select 1 from job_sources js where js.job_id=j.id
    and js.last_seen_at >= now() - interval '48 hours')`;

export function buildJobsQuery(filters, maxAgeDays = 30) {
  const values = [maxAgeDays];
  const clauses = [visibleJobsSql];
  function bind(value) { values.push(value); return '$' + values.length; }
  if (filters.keyword) {
    const escaped = filters.keyword.replace(/[\\%_]/g, '\\$&');
    const parameter = bind('%' + escaped + '%');
    clauses.push(`(j.title ilike ${parameter} escape E'\\\\' or j.company ilike ${parameter} escape E'\\\\' or j.description ilike ${parameter} escape E'\\\\')`);
  }
  for (const [key, column] of [['role','role'],['city','city'],['type','job_type'],['location_type','location_type']]) {
    if (filters[key]) clauses.push('j.' + column + '=' + bind(filters[key]));
  }
  const limitParameter = bind(filters.limit);
  const offsetParameter = bind((filters.page - 1) * filters.limit);
  const text = `with filtered as (
    select j.id,j.title,j.company,j.description,j.original_url,j.source,j.source_job_id,
      j.city,j.role,j.location_type,j.job_type,j.posted_at,j.fetched_at,j.location_evidence,
      s.name as source_name,s.terms_url as source_terms_url
    from jobs j join sources s on s.id=j.source where ${clauses.join(' and ')}
  )
  select (select count(*)::int from filtered) as total,
    coalesce((select jsonb_agg(row_to_json(p)) from (
      select * from filtered order by posted_at desc,id asc limit ${limitParameter} offset ${offsetParameter}
    ) p),'[]'::jsonb) as jobs`;
  return { text, values };
}
