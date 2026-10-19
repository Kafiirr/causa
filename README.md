# CAUSA

**Make the unknown observable.**

A standalone, pre-event prototype for an evidence-first physical diagnostic assistant. The initial application combines a working diagnostic state machine with a simulated irrigation rig and browser camera reference capture.

## Run

Requires Node.js 22.13 or later. Install dependencies once. No API key is needed for simulation, camera capture, or offline tests.

```sh
npm run install:ci
npm start
```

Open http://127.0.0.1:4173. To use a different port, set `PORT`.

```sh
npm test
npm run check
```

Optional browser checks are in `scripts/browser-check.cjs`. With a preview running and Playwright available, run `npm run test:browser`. `PLAYWRIGHT_MODULE` can point to an existing Playwright installation; `CHROME_PATH` can select an installed Chromium browser. Otherwise the script uses Playwright's installed browser. It uses a synthetic camera, writes ignored screenshots and an evidence export to `artifacts/`, and checks all fault paths, camera lifecycle, export, responsive layouts, and case-reset races. `CAUSA_TEST_URL` defaults to the local preview URL. This optional QA dependency is not required by the application.

Source assets live in `public/`; the shared gateway lives in `server/perception.mjs`. `npm run build` creates the Sites Worker and browser assets in `dist/`. The loopback development server serves the same gateway; opening HTML as a local file is unsupported.

## Try the investigation

1. Choose **New investigation** and a blind or specified case.
2. Read the proposed test and its alternative expected outcomes.
3. **Commit prediction**, then **Run simulated test**.
4. Repeat until one supported explanation remains.
5. Apply the simulated repair, then run the separate simulated flow check.
6. Open **Evidence** to inspect the sequence and export it as JSON.

An unclear observation retains the current hypotheses. A diagnosis or repair attempt cannot close a case. Verification requires at least 10 mL/s measured over at least 10 simulated seconds.

## What is real and what is simulated

- Real: information-gain test selection, explicit prediction commitments, immutable state transitions, hypothesis elimination, uncertainty handling, verification gating, evidence export, browser camera acquisition and capture.
- Simulated: equipment state, diagnostic observations, repairs, and flow measurements. Test animations compress simulated time; they do not measure real elapsed collection time.
- Camera captures / image uploads: six reference frames per case, resized to a maximum 960-pixel side. They stay in browser memory until explicitly analyzed or exported. Starting another case or reloading clears them.
- Meta perception: Muse Spark structured visual observations followed by task-specific SAM 3.1 segmentation requests (up to five unique concepts for a full scene). Task-specific targets, optional operator-selected crops, labeled frozen-frame overlays, per-component review, frame/crop hashes, and exportable model provenance. Requires a server key. Results never change the diagnostic engine.
- Layout B mirrors the presentation of the same reviewed connection graph. This is not evidence of generalization to a new topology.
- Live integration checked: authenticated model catalog, Muse structured image observations, SAM empty results, and nonempty SAM masks using synthetic fixtures.
- Not validated: real-camera observation accuracy, physical sensors, or physical diagnostic procedures. Synthetic integration checks are not evidence of real-rig reliability.

The planner never receives the selected simulator fault. This is separation of application responsibilities, not a security boundary against someone inspecting local browser code.

## Project boundaries

This project uses original source in an independent project directory. It does not import Barzakh code or modify its app, dependencies, contracts, or runtime. The Sites source workflow creates an independent Git repository for CAUSA. The surrounding Barzakh checkout may show this directory as untracked; do not add it as a Barzakh submodule unintentionally.

The interface loads DM Sans and Space Grotesk from Google Fonts, with system fallbacks. Camera frames are not sent to the font provider. Choosing **Analyze selected frame** sends that frame and any selected crop through the server to Meta, when credentials are configured.

## Next implementation gates

1. Verify final event rules before deciding what pre-event work can be submitted.
2. Validate a low-voltage rig and expert-reviewed diagnostic procedures. The current fault ontology and predictions are authored assumptions, not learned physics.
3. Test the activated Muse Spark and SAM 3.1 integration on actual rig images after assembling the rig.
4. Use the frame-linked review workflow to validate observation accuracy before connecting any model outcome to elimination or verification.
5. Run blind trials, including unsupported faults and ambiguous views, against a fixed checklist.

See [architecture](docs/ARCHITECTURE.md), [build brief](docs/BUILD-BRIEF.md), and [field rig](docs/FIELD-RIG.md).

## Configure Meta perception

1. Copy `.env.example` to the ignored `.env` in **this CAUSA directory**. Set `MODEL_API_KEY` locally; do not put it in browser code, Git, screenshots, or chat.
2. Restart `npm start`. For the hosted site, set the same name in Sites runtime secrets; the local `.env` is never published.
3. Open **Camera → Check connection**, capture or load a reference image, choose an inspection, then **Analyze selected frame**. Status confirms only key presence, not working model access.
4. **Inspection** and **Analysis target** control the same target, including full-frame reservoir, outlet, and tubing inspection. **All visible components** checks all six component roles. Changing either selector clears the displayed result and requires an explicit analysis.
5. Inspect the two independent outputs: dashed blue boxes are approximate **Muse proposals**; filled regions are **SAM masks** associated with those proposals. Each has its own visibility toggle and review. A Muse box does not turn a SAM miss into a successful mask. Generic SAM matches that cannot be assigned remain available under **unassigned candidates**, without a main/bypass role label.
6. If localization misses or confuses a component, choose **Mark component region**, then drag a box around that component and useful labels. Exact coordinates are also available. Choose **Analyze selected frame** again; changing a region never sends a request automatically. **Use full frame** clears the crop.
7. Review descriptions and localization separately for each component. A completed empty result can be marked **Visible component was missed**; it cannot be marked as a matching region. Record a valve state only if independently known. Export from **Evidence** before leaving.

Use explicit MAIN/BYPASS labels. A still frame cannot establish pump operation, flow rate, or successful repair. Physical valve state also remains unknown. T-shaped, round, or unidentified handles always have unknown direction; only a usable visible lever can retain a direction candidate. Repeated contradictory visibility/direction claims for the same image and scope are flagged. The UI reports per-component agreement and distinct image hashes; repeated analyses of one image are not independent samples. Unclear/unassessed reviews are excluded, while incorrect and missed localizations stay in the denominator. These are exploratory operator assessments, not calibrated accuracy metrics. Reviews are append-only per analysis; a repeat analysis creates a separate record.

The gateway uses `muse-spark-1.3` and `sam-3.1`, fixed Meta endpoints, a 30-second timeout per upstream call, one analysis in flight and four analyses per minute per user **per running isolate**. This in-memory limiter is not a durable spending cap. The UI allows 24 analyses per case; each analysis makes one Muse call and one SAM call for a focused task/crop, or up to five SAM calls for a full-scene inspection (one shared valve request), with no automatic retries. Representative latency, cost, quota, and real-rig accuracy still need measurement. Muse uses minimal reasoning and a 4096-token total output budget; this includes hidden reasoning tokens.

See [perception architecture and API references](docs/ARCHITECTURE.md) and [validation protocol](docs/VALIDATION.md).

### Local versus hosted configuration

`causa/.env` configures only your local process. Restart `npm start` after changing it. The published site reads **Sites runtime secrets**, so changing the local file cannot activate the hosted URL. Hosted secret updates require deployment to apply their environment revision. Never place keys in `public/`, `.openai/hosting.json`, or a browser environment variable.

The hosted key was configured as a secret during activation. The status endpoint checks key presence only; a successful analysis verifies actual model access at that time.

### Explicit live integration checks

Normal unit and browser regression tests mock model transport and never make Meta requests, even when a local key exists. These separate commands make billable calls and must be opted into:

```sh
node scripts/meta-smoke.mjs --allow-live --image path/to/test-image.png --sam
# With npm start running, and Playwright/Chrome available:
node scripts/meta-browser-smoke.cjs --allow-live
```

The first command sends the specified image to Meta and records a sanitized report in `artifacts/meta-live-smoke.json`. It runs one Muse request and up to five unique-concept segmentation requests. `--sam` adds a standalone valve segmentation request only if Muse selects no components. The second uses the app's synthetic schematic and an operator-selected crop to test upload, the original-plus-crop Muse request, targeted SAM, review, and export. Its report and full evidence export stay in ignored `artifacts/`. These are integration checks, not camera-accuracy tests.

To check a supplied reference image with live Meta calls, run `node scripts/meta-reference-check.cjs --allow-live --image path/to/reference.png` with the preview and Playwright available. Optional `--task pump --region 200,290,185,185` tests a manually selected crop in resized source pixels. Reports and overlays stay in ignored `artifacts/`; no reference image or key is committed. This is a debugging check, not a held-out accuracy evaluation.
