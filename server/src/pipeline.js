import { canonicalUrl, descriptionHash, eligibility, fingerprint } from './normalize.js';
export function prepare(jobs, now, maxAgeDays) {
    const candidates = [];
    const seenIds = new Set(), seenUrls = new Set();
    let repeated = 0, invalid = 0;
    for (const job of jobs) {
        try {
            const canonical_url = canonicalUrl(job.original_url);
            const key = job.source + ':' + job.source_job_id;
            if (seenIds.has(key) || seenUrls.has(canonical_url)) {
                repeated++;
                continue;
            }
            seenIds.add(key);
            seenUrls.add(canonical_url);
            candidates.push({ ...job, canonical_url, fingerprint: fingerprint(job), description_hash: descriptionHash(job), decision: eligibility(job, now, maxAgeDays) });
        }
        catch {
            invalid++;
        }
    }
    return { candidates, repeated, invalid };
}
