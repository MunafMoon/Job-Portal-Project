import { describe, it, expect, vi } from 'vitest';
import { jobSchema } from '../src/domain.js';
import { plain, canonicalUrl, eligibility, fingerprint, descriptionHash } from '../src/normalize.js';
import { prepare } from '../src/pipeline.js';
import { safeFingerprintMatch } from '../src/repository.js';
import { remotive } from '../src/sources/remotive.js';
import { enabledSources } from '../src/sources/index.js';
import { requester } from '../src/http.js';
const now = new Date('2026-11-17T00:00:00Z');
// Synthetic test fixture only, never ingested as live data.
const fixture = (overrides = {}) => ({
    title: 'Junior Engineer', company: 'Fixture Company', description: 'Entry level developer opportunity. ' + 'Build software with a team. '.repeat(12),
    original_url: 'https://example.test/jobs/1', source: 'remotive', source_job_id: '1', city: 'Unknown', role: 'Unknown',
    location_type: 'remote', job_type: 'full_time', posted_at: '2026-11-16T00:00:00Z', fetched_at: now.toISOString(),
    location_evidence: 'India', ...overrides,
});
describe('normalization', () => {
    it('removes markup and executable content', () => {
        expect(plain('<p>Hello</p><script>alert(1)</script><p>World &amp; team</p>')).toBe('Hello World & team');
    });
    it('canonicalizes tracking but preserves requisition parameters and case', () => {
        expect(canonicalUrl('https://example.test/Jobs?id=1&utm_source=x#top')).toBe('https://example.test/Jobs?id=1');
        expect(canonicalUrl('https://example.test/Jobs?id=2')).not.toBe(canonicalUrl('https://example.test/Jobs?id=1'));
        expect(() => canonicalUrl('javascript:alert(1)')).toThrow();
        expect(() => canonicalUrl('https://user:pass@example.test')).toThrow();
    });
    it('rejects empty titles and invalid enums', () => {
        expect(jobSchema.safeParse(fixture({ title: '' })).success).toBe(false);
        expect(jobSchema.safeParse({ ...fixture(), job_type: 'made-up' }).success).toBe(false);
    });
});
describe('eligibility', () => {
    it.each(['India', 'Worldwide', 'Anywhere'])('accepts explicit fresher eligibility in %s', location => {
        expect(eligibility(fixture({ location_evidence: location }), now, 30).status).toBe('eligible');
    });
    it.each(['Senior Engineer', 'Engineering Manager', 'Staff Developer'])('rejects senior title %s', title => {
        expect(eligibility(fixture({ title }), now, 30).status).toBe('rejected');
    });
    it('rejects mandatory experience, stale jobs and outside-India restrictions', () => {
        expect(eligibility(fixture({ description: 'Requires 3 years experience' }), now, 30).reasons).toContain('mandatory_experience');
        expect(eligibility(fixture({ posted_at: '2026-01-01T00:00:00Z' }), now, 30).reasons).toContain('stale');
        expect(eligibility(fixture({ location_evidence: 'United States only' }), now, 30).status).toBe('rejected');
    });
    it.each([
        { location_evidence: 'Asia' }, { location_evidence: '' }, { posted_at: null },
        { description: 'Must reside in the United States. Entry level.' },
        { description: 'Junior role, 3 years preferred.' }, { title: 'Engineer', description: 'Build software.' },
        { posted_at: '2027-01-01T00:00:00Z' },
    ])('preserves ambiguity for review: %o', overrides => {
        expect(eligibility(fixture(overrides), now, 30).status).toBe('review');
    });
});
describe('deduplication', () => {
    it('deduplicates IDs and tracking URLs', () => {
        const result = prepare([fixture(), fixture(), fixture({ source_job_id: '2', original_url: 'https://example.test/jobs/1?utm_source=a' })], now, 30);
        expect(result.candidates).toHaveLength(1);
        expect(result.repeated).toBe(2);
    });
    it('does not collapse separate same-source requisitions by fingerprint', () => {
        const a = fixture(), b = fixture({ source_job_id: '2', original_url: 'https://example.test/jobs/2' });
        const jobs = prepare([a, b], now, 30).candidates;
        expect(jobs).toHaveLength(2);
        expect(fingerprint(a)).toBe(fingerprint(b));
        expect(safeFingerprintMatch(jobs[0], jobs[1])).toBe(false);
    });
    it('requires substantial identical descriptions, cross-source provenance and near dates', () => {
        const a = prepare([fixture()], now, 30).candidates[0];
        const b = { ...a, source: 'reviewed-other' };
        expect(safeFingerprintMatch(a, b)).toBe(true);
        expect(safeFingerprintMatch(a, { ...b, posted_at: null })).toBe(false);
        expect(safeFingerprintMatch(a, { ...b, description_hash: descriptionHash(fixture({ description: 'Different' })) })).toBe(false);
        expect(safeFingerprintMatch(a, { ...b, posted_at: '2026-01-01T00:00:00Z' })).toBe(false);
    });
});
describe('Remotive adapter', () => {
    const raw = { id: 123, title: 'Junior Developer', company_name: 'Fixture', description: '<p>Entry level</p>', url: 'https://remotive.com/remote-jobs/test/123', candidate_required_location: 'India', publication_date: '2026-11-16T10:00:00', job_type: 'internship' };
    it('validates records independently and never infers a city', async () => {
        const batch = await remotive.fetchJobs({ now, request: async () => ({ jobs: [raw, { bad: true }] }) });
        expect(batch.raw_count).toBe(2);
        expect(batch.invalid_count).toBe(1);
        expect(batch.jobs[0]).toMatchObject({ city: 'Unknown', source_job_id: '123', posted_at: '2026-11-16T10:00:00.000Z', description: 'Entry level' });
    });
    it('keeps a missing posting date unknown for review', async () => {
        const batch = await remotive.fetchJobs({ now, request: async () => ({ jobs: [{ ...raw, publication_date: undefined }] }) });
        expect(batch.jobs[0]?.posted_at).toBe(null);
    });
    it('rejects malformed feed envelope and unknown sources', async () => {
        await expect(remotive.fetchJobs({ now, request: async () => ({ bad: true }) })).rejects.toThrow();
        expect(() => enabledSources('unreviewed')).toThrow();
    });
});
describe('request policy', () => {
    it('retries transient errors with spacing and succeeds', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(Response.json({ jobs: [] }));
        const sleep = vi.fn(async (_ms) => { });
        const request = requester(remotive.policy, vi.fn(), { fetch: fetcher, sleep, random: () => 0 });
        expect(await request(remotive.policy.endpoint)).toEqual({ jobs: [] });
        expect(sleep).toHaveBeenCalledWith(31000);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it.each([403, 404])('never retries status %s', async (status) => {
        const fetcher = vi.fn().mockResolvedValue(new Response('', { status }));
        await expect(requester(remotive.policy, vi.fn(), { fetch: fetcher })(remotive.policy.endpoint)).rejects.toThrow();
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('honors long Retry-After by ending the run', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
        const sleep = vi.fn(async (_ms) => { });
        await expect(requester(remotive.policy, vi.fn(), { fetch: fetcher, sleep })(remotive.policy.endpoint)).rejects.toThrow();
        expect(sleep).not.toHaveBeenCalled();
    });
    it('bounds attempts and passes a timeout signal', async () => {
        const fetcher = vi.fn().mockRejectedValue(new TypeError('network'));
        await expect(requester(remotive.policy, vi.fn(), { fetch: fetcher, sleep: async () => { } })(remotive.policy.endpoint)).rejects.toThrow();
        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    });
});
it('does not fetch when the shared daily request budget is exhausted', async () => {
    const fetcher = vi.fn();
    const request = requester(remotive.policy, vi.fn(), {
        fetch: fetcher, beforeAttempt: async () => { throw new Error('Daily budget exhausted'); },
    });
    await expect(request(remotive.policy.endpoint)).rejects.toThrow('Daily budget exhausted');
    expect(fetcher).not.toHaveBeenCalled();
});
