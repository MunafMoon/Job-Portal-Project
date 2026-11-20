# Source review: Remotive
Reviewed 2026-11-17 against https://github.com/remotive-com/remote-jobs-api and https://remotive.com/remote-jobs/api.
Public API: https://remotive.com/api/remote-jobs

Permission: the publisher explicitly grants API access to share its jobs. Conditions:
- Attribute Remotive and link to the supplied Remotive listing URL.
- No email/signup gate for viewing jobs.
- Do not syndicate to other job aggregators (including named third-party boards).
- Listings in the public feed are delayed 24 hours by the publisher; do not attempt to circumvent this.
- Recommended maximum four requests/day; excessive requests above twice/minute are blocked.

Implementation: one full feed request per run, six-hour persisted cooldown, retries at least 31 seconds apart, bounded attempts, no redirect/challenge bypass. Daily production cadence is appropriate. Every production attempt, including retries, consumes a persisted UTC-day request budget of four. A failed run retains its cooldown. Do not run dry-run repeatedly: it intentionally has no database state and cannot enforce cross-process cooldown.

The feed documents its listings as active; this is source-level evidence only. We do not crawl application URLs. Remotive's original URL is retained, not replaced by a direct employer URL. The source can change its terms; re-review before production release. New adapters must have an explicit source-policy entry and registry inclusion before enabling.

## Additional sources reviewed 2026-11-20

### Jobicy
Official documentation and fair use: https://jobicy.com/jobs-rss-feed
Allows storing, processing, AI analysis and redistribution with attribution, including own job boards. Preserve the public Jobicy listing URL for applications and do not claim authorship.
Uses /api/jobs?count=100&geo=anywhere with opaque cursor pagination. India is not a valid geo slug in the live taxonomy; we do not invent that filter. APAC alone is not proof of India eligibility.
Provider limit: at most one request/second/IP, honor Retry-After, avoid minute 00 schedules. Implementation spaces requests at least 1.1 seconds and caps daily calls at 60; one-hour source cooldown. Stop at null cursor, not an estimated total.

### Remote OK
Live API notice: https://remoteok.com/api
Permits reuse with its name and a follow link to the canonical Remote OK listing. Do not use its logo without written permission.
Implementation validates the legal notice, retains original listing links and uses no logo. Missing location is Unknown, not assumed worldwide.
Conservative application policy: 20-hour source cooldown for daily schedule jitter, three requests/day, no more than one request per 31 seconds.

### Himalayas
Official API: https://himalayas.app/api
API-specific terms: https://himalayas.app/terms (section 113)
Explicitly permits personal/commercial own-site job-board use without asking. Preserve applicationLink for all Apply actions, visibly link to Himalayas as source, exclude expired jobs, cache, respect limits, and never onward-syndicate to third-party boards/Google Jobs/LinkedIn.
The source link appears on each job card. No JobPosting structured data or third-party syndication is produced.
Search endpoint: /jobs/api/search?country=India&seniority=Entry-level&sort=recent&page=N.
Check actual country and India UTC+5:30 eligibility as well as source seniority; source metadata never overrides explicit senior experience, foreign-location conflicts or expiry.
The search API returns 20/page and an estimated totalCount; stop at an empty page, deduplicate IDs and report capped traversal as partial. The verified run returned 736 real records, not the estimated 733.
pubDate is last updated, not guaranteed original publication. expiryDate is explicit; jobs can close earlier. Fresh source presence is not an independent employer check.
Keyless limits are lower than keyed limits and not numerically specified in the docs. After a real HTTP 429 was honored, future calls use at least 6.5-second spacing, 20-hour cooldown and a 90-request UTC-day budget. Never bypass blocking.
