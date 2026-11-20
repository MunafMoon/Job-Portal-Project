# Reproducible role/city evaluation
A real 50-job eligible sample was exported on 2026-11-20 from a 375-job population.
Set ID: 0e4f1cfd-82e5-4f2d-997a-ea42c0eaaf11.
Local files: artifacts/evaluation-v1/{manifest.json,jobs.json,labels.json,INSTRUCTIONS.txt}.
Artifacts are ignored by Git. No model predictions or manual labels have been fabricated.

## Human labeling
Read jobs.json and fill every role/city null in labels.json. Use the role taxonomy in manifest.json.
Use Unknown for missing/ambiguous information. Canonical city aliases (e.g. Bangalore/Bengaluru) are accepted by the scorer.
Do not inspect predictions before labeling or use an LLM as the gold annotator. Keep IDs unchanged.
The city validator is deliberately conservative and currently recognizes a documented allowlist of Indian city names. Other genuine cities can receive Unknown and count as errors against human gold.
The labeling population is configurable: eligible excludes review jobs; candidates includes eligible + review. This choice is saved with the evaluation set.

## Commands
For a new sample (output directory must not exist):
```powershell
npm run evaluate -- export --seed takehome-v1 --scope eligible --size 50 --out artifacts/evaluation-new
```
Sampling ranks SHA-256(seed + job ID) and selects the first N; input ordering does not change the result.
Reproduction requires the same frozen population. Database snapshots preserve original input even when live jobs change.
If fewer than 50 jobs exist, export fails rather than fabricating. --allow-small-sample explicitly permits fewer and records the true size.

After setting Gemini configuration:
```powershell
npm run evaluate -- tag --set 0e4f1cfd-82e5-4f2d-997a-ea42c0eaaf11
npm run evaluate -- score --set 0e4f1cfd-82e5-4f2d-997a-ea42c0eaaf11 --labels artifacts/evaluation-v1/labels.json --out artifacts/evaluation-v1/results.json
```
Evaluation tagging uses snapshots and never updates live job classifications. Repeating tag skips existing successful predictions.
Scoring requires exactly the sampled IDs, complete valid human labels, and real predictions.
It calculates role accuracy, city accuracy and joint accuracy over all sampled posts, including Unknown as a class.
Cost per 1000 = all recorded evaluation request costs / sampled posts * 1000, including invalid responses and repeated attempts.
Input/cached/output usage is provider-reported; Gemini thinking tokens count as output. Rates and their source/date are stored per request.
Unknown usage produces null cost and a failing exit code, never zero or an invented estimate. List-price estimates are not actual invoice charges.
Existing label/output files are never silently overwritten. Incomplete labels or predictions fail explicitly.

## Completion status
The commands and their tests are implemented. Gemini generated ten snapshot predictions with real usage; subsequent calls returned HTTP 503, so forty predictions remain pending. Human gold labels are still required. A failed call with unreported usage makes the total cost unknown; observed measured cost is exposed separately as a lower bound. No accuracy is claimed before complete human labels and predictions exist.

## AI-assisted references are now available
The user delegated annotation to Codex. All 50 references are filled and imported as ai_assisted, with exact evidence and hashes in labels.metadata.json. They are not human gold. Default scoring detects the sidecar and keeps human-accuracy fields null; agreement fields describe the AI-reference comparison. Use import-labels to persist references independently of predictions. --allow-partial-predictions reports available coverage explicitly and does not make acceptance pass. See docs/ai-assisted-label-review.md for actual results.

After genuine independent human review, save reviewed labels in a separate directory without the AI sidecar and explicitly use --label-origin human; do not rename AI annotations as human without that review. An origin conflicting with an existing sidecar or a changed label hash fails.
