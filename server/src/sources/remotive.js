import { z } from 'zod';
import { jobSchema } from '../domain.js';
import { plain } from '../normalize.js';
const rawJob = z.object({
    id: z.number().int().positive(), title: z.string(), company_name: z.string(), description: z.string(),
    url: z.string().url(), candidate_required_location: z.string().default(''),
    publication_date: z.string().optional(), job_type: z.string().optional(),
});
export const remotive = {
    policy: {
        id: 'remotive', name: 'Remotive', endpoint: 'https://remotive.com/api/remote-jobs',
        terms_url: 'https://github.com/remotive-com/remote-jobs-api',
        terms_checked_at: '2026-11-17', attribution: 'Remotive; link to original Remotive URL; no signup wall; no third-party syndication',
        min_interval_ms: 6 * 60 * 60 * 1000, timeout_ms: 20000, max_attempts: 3, max_requests_per_day: 4,
    },
    async fetchJobs({ request, now }) {
        const body = z.object({ jobs: z.array(z.unknown()) }).parse(await request(this.policy.endpoint));
        const jobs = [];
        let invalid_count = 0;
        for (const item of body.jobs) {
            const result = rawJob.safeParse(item);
            if (!result.success) {
                invalid_count++;
                continue;
            }
            const raw = result.data;
            const date = raw.publication_date ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(raw.publication_date) ? raw.publication_date : raw.publication_date + 'Z') : null;
            const parsed = jobSchema.safeParse({
                title: plain(raw.title), company: plain(raw.company_name), description: plain(raw.description),
                original_url: raw.url, source: this.policy.id, source_job_id: String(raw.id), city: 'Unknown',
                location_type: 'remote', job_type: ['full_time', 'part_time', 'contract', 'freelance', 'internship'].includes(raw.job_type ?? '') ? raw.job_type : 'Unknown',
                posted_at: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
                fetched_at: now.toISOString(), location_evidence: plain(raw.candidate_required_location), role: 'Unknown',
            });
            if (parsed.success)
                jobs.push(parsed.data);
            else
                invalid_count++;
        }
        return { jobs, raw_count: body.jobs.length, invalid_count };
    },
};
