# Contribution record

Pre-event baseline: `ea084fdb5c1616b334a5e14e56b2ddec315e4cc9`, October 21, 2026. Preserve this history and disclose the existing simulation, diagnostic engine, physical evidence forms, camera perception and export.

## October 26, 2026

- Relocated standalone checkout to `/home/kafir/causa`.
- Added physical-mode Muse test planning: `public/planning.js`, `public/planner-ui.js`, `public/model-config.js`, `server/planner.mjs`, `app/api/planner/route.ts`.
- Added operator acceptance/decline and auditable proposals in the evidence timeline. A proposal alone neither eliminates causes nor performs a test.
- Fixed manual test selection so the displayed procedure and predictions follow the selected test.
- Added planner unit, mocked browser and opt-in live integration checks. Declared the Zod dependency required by the hosting runtime.

These dates describe actual work, not an eligibility claim. The supplied guide lists October 27–November 4 as the building period. Obtain organizer clarification on October 26 work and pre-existing prototype reuse before claiming either as eligible submission work.

## Model configuration

Meta direct planner: `muse-spark-1.3`, with `MODEL_API_KEY`.
Baseten planner: `meta-models/muse-spark-open-1026`, with `BASETEN_API_KEY` and `CAUSA_PLANNER_PROVIDER=baseten`.
The exact Baseten ID comes from the participant guide override. No generic alias or cross-provider fallback is used. SAM perception remains on the Meta API using `sam-3.1`.

Local live check: one request to Meta, requested and reported model `muse-spark-1.3`, valid pump test proposal, 3.413 seconds, 321 input / 324 output tokens. This used a synthetic context, not a physical rig. Baseten live access remains unverified because its credential is not configured. No physical accuracy or improved diagnosis performance is claimed.
