# CAUSA

**Make the unknown observable.**

[Live demo](https://causa-gold-pi.vercel.app) · [Source](https://github.com/Kafiirr/causa)

Causa investigates no-flow faults in a tabletop water system: reservoir → pump → main/bypass branches → collection cup. It guides tests, records predictions before observations, narrows supported causes, recommends a repair, and requires a separate functional check.

**Current scope:** main valve closed, main tube restricted, inlet obstructed, or pump off—one fault at a time in the reviewed topology. It is not a general machine diagnostic tool.

**Demo without hardware:** run a simulated investigation and load a reference image in Camera to demonstrate visual inspection. Image analysis stays separate from the simulated diagnosis. A successful simulated repair is not a verified physical repair.

| Capability | Model / runtime | Role |
| --- | --- | --- |
| Simulation | Deterministic diagnostic engine | Chooses informative tests and replays evidence without an LLM |
| Physical test proposals | Baseten `meta-models/muse-spark-open-1026` | Proposes an authored test for operator acceptance |
| Visual observations | Meta `muse-spark-1.3` | Describes and proposes locations of visible components |
| Segmentation | Meta `sam-3.1` | Produces candidate masks for operator review |

Baseten is the configured planner provider. The exact hackathon model ID is pinned; the generic documentation alias is not used. An explicitly selected Meta direct planner is also supported.

## Run

Requires Node.js 22.13 or later. Install dependencies once. No API key is needed for simulation, camera capture, or offline tests.

```sh
npm ci
cp .env.example .env
# Add server API keys to .env only if using live AI.
npm start
```

Open http://127.0.0.1:4173. To use a different port, set `PORT`.

```sh
npm test
npm run check
```

Optional browser checks are in `scripts/browser-check.cjs`. With a preview running and Playwright available, run `npm run test:browser`. `PLAYWRIGHT_MODULE` can point to an existing Playwright installation; `CHROME_PATH` can select an installed Chromium browser. Otherwise the script uses Playwright's installed browser. It uses a synthetic camera, writes ignored screenshots and an evidence export to `artifacts/`, and checks all fault paths, camera lifecycle, export, responsive layouts, and case-reset races. `CAUSA_TEST_URL` defaults to the local preview URL. This optional QA dependency is not required by the application.

Source assets live in `public/`; shared model gateways live in `server/`. `node scripts/build-vercel.mjs` prepares Vercel static assets; `api/` supplies Node functions. The existing `npm run build` remains the optional Sites/Cloudflare build. The loopback development server serves the same gateways; opening HTML as a local file is unsupported.

## Try the investigation

1. Choose **New investigation** and a blind or specified case.
2. Read the proposed test and its alternative expected outcomes.
3. **Commit prediction**, then **Run simulated test**.
4. Repeat until one supported explanation remains.
5. Apply the simulated repair, then run the separate simulated flow check.
6. Open **Evidence** to inspect the sequence and export it as JSON.

An unclear observation retains the current hypotheses. A diagnosis or repair attempt cannot close a case. Verification requires at least 10 mL/s measured over at least 10 simulated seconds.

## Investigate a physical rig

Choose **New investigation → Physical rig**. Identify your tabletop rig, confirm the connection graph, one introduced fault and initial no-flow symptom, and set a healthy-output target (mL/s) and minimum collection interval (at least 10 seconds). No fault is selected or simulated in this mode.

Commit a prediction before testing. The bypass test requires collected volume and duration; valve inspection requires an independently known indicator/calibration; pump inspection requires actual operator observation. “Cannot tell” preserves candidates. Record notes and confirm configuration restoration. Optionally link a camera/upload frame and its existing model analyses/reviews; these links add context only. You can choose another supported test if the recommended one is unavailable.

The result card shows the suspected cause, supporting observations, repair and verification status. Record the repair you actually performed, then measure output with the bypass closed. Too-short or low-flow checks fail and leave the case open; conflicting observations produce no repair recommendation. A pass means the **operator-reported** measurement meets the precommitted criterion, not independent sensor verification. Export before closing/reloading: case state remains in browser memory.

Physical workflow browser QA: `node scripts/physical-browser-check.cjs` with the same Playwright/Chrome environment variables and a preview on port 4183 (or `CAUSA_TEST_URL`). Its inputs and fake camera are test fixtures, not field-validation evidence.

## What is real and what is simulated

- Real: information-gain test selection, explicit prediction commitments, immutable state transitions, hypothesis elimination, uncertainty handling, verification gating, evidence export, browser camera acquisition and capture.
- Simulation mode only: equipment state, diagnostic observations, repairs, and flow measurements. Test animations compress simulated time; they do not measure real elapsed collection time.
- Physical mode: operator-reported setup, outcomes, repair attempts and volume/time measurements drive the authored four-cause model. They are not model-verified physical facts.
- Camera captures / image uploads: six reference frames per case, preserved up to 1920 pixels per side and 2.1 megapixels, with JPEG quality adjusted only to fit the 1.8 MB gateway limit. They stay in browser memory until explicitly analyzed or exported. Starting another case or reloading clears them.
- Meta perception: Muse Spark structured visual observations followed by task-specific SAM 3.1 segmentation requests (up to six unique concepts for a full scene). Task-specific targets, optional operator-selected crops, labeled frozen-frame overlays, per-component review, frame/crop hashes, and exportable model provenance. Requires a server key. Results never change the diagnostic engine.
- Layout B mirrors the presentation of the same reviewed connection graph. This is not evidence of generalization to a new topology.
- Live integration checked: authenticated model catalog, Muse structured image observations, SAM empty results, and nonempty SAM masks using synthetic fixtures.
- Not validated: real-camera observation accuracy, physical sensors, or physical diagnostic procedures. Synthetic integration checks are not evidence of real-rig reliability.

The planner never receives the selected simulator fault. This is separation of application responsibilities, not a security boundary against someone inspecting local browser code.

## Contribution history

This standalone repository preserves the prototype's history. The pre-event baseline is `ea084fdb5c1616b334a5e14e56b2ddec315e4cc9` (October 21, 2026). The simulation, physical evidence forms, perception and export existed before the event. Physical-mode model planning was added October 26; the supplied guide lists October 27–November 4 as the building period. These dates must be disclosed when selecting eligible demo contributions.

See [contributions](docs/CONTRIBUTIONS.md) and [hackathon readiness](docs/HACKATHON-READINESS.md). Deployment does not establish eligibility or real-rig accuracy.

The interface loads DM Sans and Space Grotesk from Google Fonts, with system fallbacks. Camera frames are not sent to the font provider. Choosing **Analyze selected frame** sends that frame and any selected crop through the server to Meta, when credentials are configured.

## Next implementation gates

1. Verify final event rules before deciding what pre-event work can be submitted.
2. Validate a low-voltage rig and expert-reviewed diagnostic procedures. The current fault ontology and predictions are authored assumptions, not learned physics.
3. Test the activated Muse Spark and SAM 3.1 integration on actual rig images after assembling the rig.
4. Use the frame-linked review workflow to validate observation accuracy before connecting any model outcome to elimination or verification.
5. Run blind trials, including unsupported faults and ambiguous views, against a fixed checklist.

See [architecture](docs/ARCHITECTURE.md), [build brief](docs/BUILD-BRIEF.md), and [field rig](docs/FIELD-RIG.md).

## Model-assisted physical test planning

Start a **Physical rig** investigation and use **Ask Muse for the next test**. Select the reviewed tests you can perform, request a proposal, then accept or decline it. Acceptance commits predictions; it does not execute hardware or record an observation. The evidence export retains the provider, requested/reported model, prompt, input, raw output, validated plan and operator decision.

The code fallback is Meta `muse-spark-1.3` with `MODEL_API_KEY`. This deployment and `.env.example` explicitly select Baseten: set `CAUSA_PLANNER_PROVIDER=baseten` and `BASETEN_API_KEY` in the server environment. The model is pinned to **`meta-models/muse-spark-open-1026`**. There is no alias or provider fallback. Local `.env` configuration does not automatically configure hosted runtime secrets.

Run `npm run test:planner-browser` against a preview for mocked browser checks. `node --env-file=.env scripts/planner-smoke.mjs --allow-live` makes one billed request using a synthetic physical-mode context. Neither establishes real-rig performance. See [contribution dates and model verification](docs/CONTRIBUTIONS.md) and [submission readiness](docs/HACKATHON-READINESS.md).

## Configure Meta perception

1. Copy `.env.example` to the ignored `.env` in **this CAUSA directory**. Set `MODEL_API_KEY` locally; do not put it in browser code, Git, screenshots, or chat.
2. Restart `npm start`. For Vercel, set the same name in project environment variables; the local `.env` is never published. Unlock live AI using the footer link before analyzing.
3. Open **Camera → Check connection**, capture or load a reference image, choose an inspection, then **Analyze selected frame**. Status confirms only key presence, not working model access.
4. **Inspection** and **Analysis target** control the same target, including full-frame reservoir, outlet, and tubing inspection. **All visible components** checks all six component roles. Changing either selector clears the displayed result and requires an explicit analysis.
5. Inspect the two independent outputs: dashed component-colored boxes are approximate **Muse proposals**; filled regions are **SAM masks** associated with those proposals. Each has its own visibility toggle and review. A Muse box does not turn a SAM miss into a successful mask. Generic SAM matches that cannot be assigned remain available under **unassigned candidates**, without a main/bypass role label. Unassigned tubing masks are shown in gray by default so a matching failure is not mistaken for a missing detection; they remain excluded from associated-mask counts.
6. To reuse a Muse proposal, open **Inspect a proposed region** in its component card and choose the proposed crop. For tubing, choose an individual section. The crop includes a small context margin and remains editable; it does not verify identity or trigger a model call. Alternatively, if localization misses or confuses a component, choose **Mark component region**, then drag a box around that component and useful labels. Exact coordinates are also available. Choose **Analyze selected frame** again; changing a region never sends a request automatically. **Use full frame** clears the crop.
7. Review descriptions and localization separately for each component. A completed empty result can be marked **Visible component was missed**; it cannot be marked as a matching region. Record a valve state only if independently known. Export from **Evidence** before leaving.

Use explicit MAIN/BYPASS labels. A still frame cannot establish pump operation, flow rate, or successful repair. Physical valve state also remains unknown. T-shaped, round, or unidentified handles always have unknown direction; only a usable visible lever can retain a direction candidate. Repeated contradictory visibility/direction claims for the same image and scope are flagged. The UI reports per-component agreement and distinct image hashes; repeated analyses of one image are not independent samples. Unclear/unassessed reviews are excluded, while incorrect and missed localizations stay in the denominator. These are exploratory operator assessments, not calibrated accuracy metrics. Reviews are append-only per analysis; a repeat analysis creates a separate record.

The gateway uses `muse-spark-1.3` and `sam-3.1`, fixed Meta endpoints, a 30-second timeout per upstream call, one analysis in flight and four analyses per minute per user **per running isolate**. This in-memory limiter is not a durable spending cap. The UI allows 24 analyses per case; each analysis makes one Muse call and one SAM call for a focused task/crop (two for tubing), or up to six SAM calls for a full-scene inspection (one shared valve request and complementary plastic-tube/pipe searches), with no automatic retries. Representative latency, cost, quota, and real-rig accuracy still need measurement. Muse uses minimal reasoning and a 4096-token total output budget; this includes hidden reasoning tokens.

See [perception architecture and API references](docs/ARCHITECTURE.md) and [validation protocol](docs/VALIDATION.md).

## Deploy to Vercel

Import this GitHub repository into Vercel. The committed `vercel.json` selects the static frontend and native Node functions, independently of the optional Cloudflare adapter. Use Node 22 or later.

Set these **server-only Production environment variables**, then deploy:

| Variable | Purpose |
| --- | --- |
| `CAUSA_PLANNER_PROVIDER` | `baseten` |
| `BASETEN_API_KEY` | Baseten hackathon credential |
| `MODEL_API_KEY` | Meta image reasoning and segmentation credential |
| `CAUSA_ACCESS_PASSWORD` | Private demo access code, at least 32 randomly generated characters |

```sh
vercel link
vercel env add CAUSA_PLANNER_PROVIDER production
vercel env add BASETEN_API_KEY production
vercel env add MODEL_API_KEY production
vercel env add CAUSA_ACCESS_PASSWORD production
vercel --prod
```

The public simulation and manual physical workflow do not require a code. **Live AI access** in the footer opens a separate tab to unlock paid calls with a signed, secure, HttpOnly cookie lasting 12 hours. Share the demo code privately with reviewers; never share provider keys. Returning to the existing investigation tab preserves its in-memory evidence. Rotating the code and redeploying invalidates existing sessions.

Vercel validates the session before supplying identity to the shared gateways; client-supplied Sites identity headers are discarded. Same-origin checks and gateway request bounds remain enforced. All demo sessions share an in-memory rate bucket per running instance; this is not a durable spending cap or a multi-user account system. Preview deployments need separately configured credentials if live AI is desired.

Local `.env` changes do not configure Vercel. Hosted environment changes require redeployment. Never put keys in `public/`, Git, or `NEXT_PUBLIC_`/`VITE_` variables. Status endpoints report configuration only; a successful model request establishes actual access at that time.

The optional Sites deployment retains its Cloudflare routes and platform identity. Its runtime secrets are configured separately. `npm run install:ci` and `npm run build` remain available for that hosting environment.

### Explicit live integration checks

Normal unit and browser regression tests mock model transport and never make Meta requests, even when a local key exists. These separate commands make billable calls and must be opted into:

```sh
node scripts/meta-smoke.mjs --allow-live --image path/to/test-image.png --sam
# With npm start running, and Playwright/Chrome available:
node scripts/meta-browser-smoke.cjs --allow-live
```

The first command sends the specified image to Meta and records a sanitized report in `artifacts/meta-live-smoke.json`. It runs one Muse request and up to six unique-concept segmentation requests. `--sam` adds a standalone valve segmentation request only if Muse selects no components. The second uses the app's synthetic schematic and an operator-selected crop to test upload, the original-plus-crop Muse request, targeted SAM, review, and export. Its report and full evidence export stay in ignored `artifacts/`. These are integration checks, not camera-accuracy tests.

To check a supplied reference image with live Meta calls, run `node scripts/meta-reference-check.cjs --allow-live --image path/to/reference.png` with the preview and Playwright available. Optional `--task pump --region 200,290,185,185` tests a manually selected crop in resized source pixels. Reports and overlays stay in ignored `artifacts/`; no reference image or key is committed. This is a debugging check, not a held-out accuracy evaluation.
