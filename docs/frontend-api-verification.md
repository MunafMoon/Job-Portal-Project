# Frontend and API verification — 2026-11-20

Implemented React .jsx / Vite / Tailwind job board with an Express .js API.

- JavaScript syntax checks passed.
- Vitest: 58 tests passed across ingestion, persistence, API and React interactions.
- Vite production build passed.
- Dependency installation audit: zero known vulnerabilities.
- Live Supabase health: HTTP 200; database connected using verified TLS.
- Live public count: 1 eligible, recently source-confirmed unique job. This is not a new ingestion and does not establish 200 jobs.
- Live API checks: default results, literal keyword search including SQL wildcard characters, role/city/workplace/type filters, empty pages with correct total, and 400 for invalid pagination.
- Development and production browser checks passed at 1440px, 390px and 320px: no horizontal overflow or browser runtime errors.
- Browser interactions checked: help dialog, Escape dismissal, job details, mobile filters and reset.
- Production HTML and bundled CSS/JS returned HTTP 200 through Express; security headers were present.
- The built JavaScript bundle did not contain the configured database URL, password or server database environment variable names. No secret values were printed.
- Screenshot artifacts are local and ignored under artifacts/. Browser profiles used for inspection are separate from the user's normal browser.

Repeat local checks:
1. npm run check
2. npm test
3. npm run build
4. npm run dev
5. In another terminal, npm run test:browser (requires installed Chrome; no browser download).

For production-path checks: npm run build, npm start, then set BROWSER_TEST_URL=http://127.0.0.1:3001 when running npm run test:browser.

Still outstanding: independently reviewed additional sources, 200-job acceptance evidence, structured OpenAI/Gemini tagging, actual token/cost evaluation, seeded 50-job manual-label export/scoring, and the daily GitHub Actions workflow.