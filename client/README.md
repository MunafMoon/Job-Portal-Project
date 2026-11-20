# FresherJobs AI frontend
React components use .jsx; helpers and Vite configuration use .js.
Built with React, Vite, Tailwind CSS and Lucide icons. No credentials belong here.

From the repository root:
1. npm ci
2. npm run dev (starts Express on http://127.0.0.1:3001 and Vite on http://127.0.0.1:5173)
3. Open http://127.0.0.1:5173

Vite proxies /api to the backend. The root .env is loaded only by Node; Vite loads client-local public environment configuration. Do not add database or LLM secrets under client/ or VITE_ variables.

npm run build emits client/dist. npm start serves both the built UI and API on port 3001 (or PORT).
npm test runs API, ingestion and React interaction tests without a live database.

Only eligible, active jobs posted within MAX_JOB_AGE_DAYS and source-confirmed in the last 48 hours appear. Missing role/city data stays Unknown. Job links go to the original publisher. Source HTML is never rendered.
