/**
 * Source adapters expose a reviewed policy and fetchJobs({ request, now }).
 * fetchJobs returns { jobs, raw_count, invalid_count }; jobs must pass jobSchema.
 * request is the rate-limited, timeout-protected HTTP function supplied by ingestion.
 * Keep missing role/city values as Unknown and retain location_evidence for review.
 */
import { z } from 'zod';
export const jobSchema = z.object({
    title: z.string().min(1).max(500), company: z.string().min(1).max(500),
    description: z.string().min(1), original_url: z.string().url(),
    source: z.string().min(1), source_job_id: z.string().min(1),
    city: z.string().default('Unknown'),
    location_type: z.enum(['remote', 'hybrid', 'onsite', 'Unknown']),
    job_type: z.enum(['full_time', 'part_time', 'contract', 'freelance', 'internship', 'Unknown']),
    posted_at: z.string().datetime().nullable(), fetched_at: z.string().datetime(),
    expires_at: z.string().datetime().nullable().optional(), experience_evidence: z.string().default(''),
    location_evidence: z.string(), role: z.string().default('Unknown'),
});
export const log = event => console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...event }));
