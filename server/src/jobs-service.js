import { buildJobsQuery, visibleJobsSql } from './jobs-query.js';

export function createJobsService(pool, { maxAgeDays = 30, target = 200 } = {}) {
  return {
    async jobs(filters) {
      const query = buildJobsQuery(filters, maxAgeDays);
      const { rows } = await pool.query(query.text, query.values);
      const { total, jobs } = rows[0];
      return { jobs, pagination: { page:filters.page, limit:filters.limit, total, pages:Math.ceil(total/filters.limit) } };
    },
    async stats() {
      const { rows } = await pool.query(`with eligible as (select j.* from jobs j where ${visibleJobsSql})
        select (select count(*)::int from eligible) as total_unique_jobs,
        (select count(*)::int from eligible where job_type='internship') as internships,
        (select count(*)::int from eligible where location_type='remote') as remote_jobs,
        (select max(finished_at) from ingestion_runs where status='success') as last_successful_refresh,
        coalesce((select jsonb_agg(distinct role order by role) from eligible),'[]') as roles,
        coalesce((select jsonb_agg(distinct city order by city) from eligible),'[]') as cities,
        coalesce((select jsonb_agg(distinct job_type order by job_type) from eligible),'[]') as types,
        coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,
          'last_success_at',last_success_at,'last_attempt_at',last_attempt_at,
          'failed',last_error is not null) order by name) from sources where enabled=true),'[]') as sources,
        (select jsonb_build_object('status',status,'finished_at',finished_at)
          from ingestion_runs order by started_at desc limit 1) as latest_run`, [maxAgeDays]);
      return { ...rows[0], target_count:target, freshness_hours:48, max_age_days:maxAgeDays };
    },
    async health() { await pool.query('select 1'); return { status:'ok', database:'connected' }; },
  };
}
