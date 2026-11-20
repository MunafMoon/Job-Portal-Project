# Completion evidence — 2026-11-20
- Four reviewed public source adapters: Remotive, Jobicy, Remote OK, Himalayas.
- The completed real multi-source run collected 21 Jobicy, 98 Remote OK and 736 Himalayas records. Remotive was correctly skipped inside its cooldown; 15 real Remotive records were already stored.
- Total stored: 870. After deterministic sample audit and stricter reclassification: 375 eligible, 271 review, 224 rejected.
- Public acceptance snapshot: 375 eligible unique jobs versus target 200. No duplicate canonical URLs were found.
- Public records require source confirmation in the last 48 hours, a fresh source date, non-expired status and eligible classification. They are not independently employer-verified.
- Himalayas pubDate is its last-updated timestamp, not guaranteed original publication. The UI uses Listed instead of Posted.
- An HTTP 429 from Himalayas was honored with backoff and a slower default request interval was adopted for future runs.
- The additive migration was applied to Supabase without dropping existing tables. Initial manually applied schema was validated and baselined.
- A real listing was saved twice inside a rolled-back transaction: both calls updated, and total row count remained 870.
- A fixed 50-job eligible evaluation snapshot was exported from 375 candidates. Human labels and predictions are intentionally blank until actually supplied/generated.
- Gemini and OpenAI tagging providers, strict schemas, evidence validation, measured usage ledger, cost snapshots/budgets and evaluation scoring are implemented and unit-tested.
- At this checkpoint no Gemini API key was configured; no live LLM accuracy, tokens or cost are claimed.
- Daily ingestion and CI workflow definitions are implemented. Remote schedule activation and repository secret configuration must be separately verified.
- Acceptance report: artifacts/acceptance.json; complete=false accurately reflects pending tagging/evaluation.

## Live continuation
Gemini key was configured and encrypted in GitHub Actions. Five public listings and ten frozen evaluation jobs were tagged successfully: 10,787 measured input tokens, 1,347 measured output tokens, recorded standard list-price estimate $0.0066036. Later Gemini calls returned HTTP 503; a Hydrogen attempt timed out. Failed calls have unknown usage/cost and are never replaced with zero total cost. Bulk tagging and the remaining evaluation predictions are incomplete.

All 50 human gold labels are still blank at this checkpoint. The source was pushed to main and remote CI passed. A dispatched ingestion run failed with ENETUNREACH at migration because GitHub cannot reach the direct Supabase endpoint. A separate GITHUB_DATABASE_URL session-pooler override is supported; Supabase connection details are pending. No full acceptance success is claimed.
