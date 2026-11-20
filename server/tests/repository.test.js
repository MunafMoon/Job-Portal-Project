import { it, expect, vi } from 'vitest';
import { saveCandidate } from '../src/repository.js';
import { prepare } from '../src/pipeline.js';
const now = new Date('2026-11-17T00:00:00Z');
const job = {
    title: 'Junior Developer', company: 'Fixture', description: 'Entry level. '.repeat(30),
    original_url: 'https://example.test/jobs/1', source: 'remotive', source_job_id: '1',
    city: 'Unknown', role: 'Unknown', location_type: 'remote', job_type: 'full_time',
    posted_at: '2026-11-16T00:00:00Z', fetched_at: now.toISOString(), location_evidence: 'India',
};
const candidate = prepare([job], now, 30).candidates[0];
function client(responses) {
    const query = vi.fn();
    for (const response of responses)
        query.mockResolvedValueOnce(response);
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    return { db: { query }, query };
}
it('updates the same source identity instead of inserting another job', async () => {
    const { db, query } = client([{ rows: [{ job_id: 'existing' }], rowCount: 1 }, { rows: [{ id: 'existing' }], rowCount: 1 }]);
    expect(await saveCandidate(db, candidate)).toBe('updated');
    expect(query.mock.calls.some(call => String(call[0]).includes('insert into jobs('))).toBe(false);
    expect(query.mock.calls.some(call => String(call[0]).includes('update jobs set'))).toBe(true);
});
it('adds source provenance for an exact canonical URL without inserting duplicate content', async () => {
    const { db, query } = client([{ rows: [], rowCount: 0 }, { rows: [{ id: 'existing' }], rowCount: 1 }]);
    expect(await saveCandidate(db, candidate)).toBe('duplicate');
    expect(query.mock.calls.some(call => String(call[0]).includes('insert into jobs('))).toBe(false);
    expect(query.mock.calls.some(call => String(call[0]).includes('insert into job_sources('))).toBe(true);
});
it('preserves a distinct same-source requisition despite an identical fingerprint', async () => {
    const { db, query } = client([
        { rows: [], rowCount: 0 }, { rows: [], rowCount: 0 },
        { rows: [{ ...candidate, id: 'other', source_job_id: '2', posted_at: new Date(job.posted_at) }], rowCount: 1 },
        { rows: [{ id: 'new' }], rowCount: 1 },
    ]);
    expect(await saveCandidate(db, candidate)).toBe('inserted');
    expect(query.mock.calls.some(call => String(call[0]).includes('insert into jobs('))).toBe(true);
});
it('propagates persistence failures to the source transaction owner', async () => {
    const query = vi.fn().mockRejectedValue(new Error('Database failure'));
    await expect(saveCandidate({ query }, candidate)).rejects.toThrow('Database failure');
});
