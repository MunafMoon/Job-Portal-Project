# AI-assisted reference-label review — 2026-11-20
At the user's explicit request, Codex reviewed and filled all 50 frozen reference-label pairs.
These are **AI-assisted annotations, not independent human gold labels**.

Local artifacts (intentionally Git-ignored):
- artifacts/evaluation-v1/labels.json: all 50 role/city pairs, IDs unchanged.
- artifacts/evaluation-v1/labels.unlabeled-original.json: preserved original blank labels.
- artifacts/evaluation-v1/labels.metadata.json: AI origin, hashes, blinding statement, per-job evidence, ambiguous decisions and eligibility findings.
- artifacts/evaluation-v1/results-ai-assisted-partial-v2.json: explicitly partial comparison against real Gemini predictions.

The input hashes matched the exported manifest. Annotations were prepared without inspecting stored Gemini prediction values. They were imported with label_origin=ai_assisted; human_validated=false.
The public acceptance gate counts only explicitly human-origin labels toward the 50-human-label criterion; AI annotations do not satisfy it.
The scorer leaves role_accuracy/city_accuracy/joint_accuracy null for AI-assisted or unverified references, exposes agreement fields instead, and discloses prediction coverage and Unknown-city prevalence.
Full prediction coverage remains required by default. --allow-partial-predictions is an explicit diagnostic opt-in, and a partial/usage-incomplete report exits nonzero.

## Provisional result
15 of 50 real provider predictions exist (30% coverage): 10 Gemini 3.5 Flash-Lite and 5 Gemini 3.1 Flash-Lite.
Role agreement 14/15 (93.33%), city agreement 15/15, joint agreement 14/15.
City evidence is sparse: only 1 evaluated reference has a known city; the other 14 are Unknown. The full reference set has 5 known cities and 45 Unknown.
One disagreement: a live Urdu interpretation role was labeled Other by the reference review and Customer Support by Gemini. The reference was not changed to improve the score.
Measured evaluation usage: 9,145 input and 1,307 output tokens, observed standard-list-price estimate $0.0054423.
Observed cost normalized per 1000 evaluated posts is $0.36282, a lower bound only. Failed calls returned no usage; total cost and full cost/1000 remain unknown.
Repeated HTTP 503 responses prevented completing the remaining 35 predictions. They were not replaced with reference labels or guesses.

## Eligibility findings
The frozen sample was retained rather than resampled to hide problems.
Review identified explicit inactive network text, an Internship 2021 title, a past June 2026 application window, unsuitable non-internship volunteer roles, nonzero experience requirements and paid feedback participation.
Regression-tested rules now reject/review those cases. A full stored-data recheck changed 99 records and left 338 eligible, 280 review and 252 rejected (870 stored).
Eligibility corrections did not alter frozen evaluation inputs, labels or historical source-run counts.

## Reproduce
npm run db:migrate
npm run evaluate -- import-labels --set 0e4f1cfd-82e5-4f2d-997a-ea42c0eaaf11 --labels artifacts/evaluation-v1/labels.json
npm run evaluate -- score --set 0e4f1cfd-82e5-4f2d-997a-ea42c0eaaf11 --labels artifacts/evaluation-v1/labels.json --allow-partial-predictions --out artifacts/evaluation-v1/a-new-report.json

Do not reuse an existing report filename: output files are protected against silent overwrite.
To obtain human-validated accuracy, an actual human must independently review all 50 references and explicitly attest that origin. AI annotations must not simply be renamed human.
