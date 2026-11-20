export class HttpError extends Error {
    status;
    retryAfterMs;
    constructor(status, retryAfterMs = 0) {
        super('Source HTTP ' + status);
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}
export function requester(policy, log, deps = {}) {
    const fetcher = deps.fetch ?? fetch;
    const sleep = deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    let lastRequest=0;
    return async (url) => {
        if (!(policy.isAllowedUrl ? policy.isAllowedUrl(url) : url === policy.endpoint))
            throw new Error('Unapproved source endpoint');
        for (let attempt = 1; attempt <= policy.max_attempts; attempt++) {
            const spacing = Math.max(0, (policy.min_request_interval_ms ?? 0) - (Date.now() - lastRequest));
            if (spacing) await sleep(spacing);
            await deps.beforeAttempt?.();
            lastRequest = Date.now();
            try {
                const response = await fetcher(url, {
                    signal: AbortSignal.timeout(policy.timeout_ms), redirect: 'error',
                    headers: { Accept: 'application/json', 'User-Agent': 'FresherJobsAI/0.1 (public API ingestion)' },
                });
                if (!response.ok) {
                    const header = response.headers.get('retry-after');
                    const ms = header ? (/^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
                    await response.body?.cancel();
                    throw new HttpError(response.status, Math.max(0, ms || 0));
                }
                return await response.json();
            }
            catch (error) {
                const transient = error instanceof HttpError ? error.status === 429 || error.status >= 500 : error instanceof TypeError || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name));
                const wait = Math.max(31000, 1000 * 2 ** (attempt - 1) + (deps.random ?? Math.random)() * 500, error instanceof HttpError ? error.retryAfterMs : 0);
                log({ event: 'source_request_failed', source: policy.id, attempt, retry: transient && attempt < policy.max_attempts, error: error instanceof Error ? error.message : 'Unknown error' });
                // Long Retry-After defers to the next scheduled run instead of retrying early.
                if (!transient || attempt === policy.max_attempts || wait > 60000)
                    throw error;
                await sleep(wait);
            }
        }
        throw new Error('Unreachable');
    };
}
