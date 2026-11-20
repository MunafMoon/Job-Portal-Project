# Daily ingestion and CI
.github/workflows/ingest.yml runs daily at 02:17 UTC (07:47 Asia/Kolkata) and supports manual workflow_dispatch.
Minute 17 avoids the top-of-hour load spike described in Jobicy guidance.
GitHub schedules can be delayed and require the workflow on the default branch; they are not a guaranteed exact-time service.
Reference: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

## Repository setup
Target repository supplied by the user: https://github.com/MunafMoon/Job-Portal-Project
The presence of workflow files locally does not prove that a schedule is active remotely.

Under repository Settings > Secrets and variables > Actions, set these secrets:
- DATABASE_URL: session-pooler/direct URI reachable from the GitHub runner.
- DATABASE_CA_PEM: full text of the downloaded CA certificate, not its local filename.
- GEMINI_API_KEY: server-side Gemini key.
- OPENAI_API_KEY: only if using OpenAI.

Optional Actions variables:
ENABLED_SOURCES, LLM_PROVIDER (gemini), LLM_MODEL (gemini-3.5-flash-lite),
LLM_INPUT_USD_PER_MILLION, LLM_CACHED_INPUT_USD_PER_MILLION, LLM_OUTPUT_USD_PER_MILLION,
TAGGING_MAX_COST_USD (2 by default). Non-catalog models require explicit input/cached/output pricing.

The workflow installs with npm ci, writes the CA to the runner temporary directory, migrates idempotently, ingests, tags, and uploads a sanitized acceptance report.
Concurrency prevents overlap at GitHub and a PostgreSQL advisory lock prevents overlap with manual local ingestion.
Source failures retain earlier jobs and remain visible as failed/partial runs. Tagging/report steps still run after ingestion errors.
The acceptance step intentionally fails until 200 public jobs, live tagging and the completed 50-job manual evaluation are present.
The workflow never uploads .env, credentials, job exports or raw LLM responses.

Use Actions > Daily real-job ingestion > Run workflow once after secrets are configured, then inspect logs and the ingestion-acceptance artifact.
A separate CI workflow runs syntax/YAML validation, unit/API/React tests, build and a production dependency audit on push/pull requests.
Actions versions follow the official repositories' current v7 documentation; review updates as part of maintenance.
