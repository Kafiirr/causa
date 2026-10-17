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
- Prepared Meta perception: Muse Spark structured visual observations followed by at most two SAM 3.1 segmentation requests. Frozen-frame overlays, operator review, frame hashes, and exportable model provenance. Requires a server key. Results never change the diagnostic engine.
- Layout B mirrors the presentation of the same reviewed connection graph. This is not evidence of generalization to a new topology.
- Not validated: live Muse/SAM calls, real-camera observation accuracy, physical sensors, or physical diagnostic procedures. This version was tested with mocked model transport only; no real API calls were made.

The planner never receives the selected simulator fault. This is separation of application responsibilities, not a security boundary against someone inspecting local browser code.

## Project boundaries

This project uses original source in an independent project directory. It does not import Barzakh code or modify its app, dependencies, contracts, or runtime. The Sites source workflow creates an independent Git repository for CAUSA. The surrounding Barzakh checkout may show this directory as untracked; do not add it as a Barzakh submodule unintentionally.

The interface loads DM Sans and Space Grotesk from Google Fonts, with system fallbacks. Camera frames are not sent to the font provider. Choosing **Analyze selected frame** sends that frame through the server to Meta, when credentials are configured.

## Next implementation gates

1. Verify final event rules before deciding what pre-event work can be submitted.
2. Validate a low-voltage rig and expert-reviewed diagnostic procedures. The current fault ontology and predictions are authored assumptions, not learned physics.
3. Activate the prepared gateway after receiving API access, then test Muse Spark image interpretation and SAM 3.1 segmentation on actual rig images.
4. Use the frame-linked review workflow to validate observation accuracy before connecting any model outcome to elimination or verification.
5. Run blind trials, including unsupported faults and ambiguous views, against a fixed checklist.

See [architecture](docs/ARCHITECTURE.md), [build brief](docs/BUILD-BRIEF.md), and [field rig](docs/FIELD-RIG.md).

## Enable Meta perception later

1. Copy `.env.example` to the ignored `.env` in **this CAUSA directory**. Set `MODEL_API_KEY` locally; do not put it in browser code, Git, screenshots, or chat.
2. Restart `npm start`. For the hosted site, set the same name in Sites runtime secrets; the local `.env` is never published.
3. Open **Camera → Check connection**, capture or load a reference image, choose an inspection, then **Analyze selected frame**. Status confirms only key presence, not working model access.
4. Inspect Muse's candidate and SAM's regions. Record observation agreement, segmentation agreement, and (for valve inspection) your reference state. Export from **Evidence** before leaving.

Use explicit MAIN/BYPASS labels. A still frame cannot establish pump operation, flow rate, or successful repair. Unknown states remain unknown. The UI's agreement count excludes unclear reviews and is an exploratory operator assessment, not a calibrated accuracy metric. Reviews are append-only per analysis; a repeat analysis creates a separate record.

The gateway uses `muse-spark-1.3` and `sam-3.1`, fixed Meta endpoints, a 30-second timeout per upstream call, one analysis in flight and four analyses per minute per user **per running isolate**. This in-memory limiter is not a durable spending cap. The UI allows 24 analyses per case; each analysis makes one Muse call and up to two SAM calls, with no automatic retries. Live latency, price, quota, and model availability need validation after access is granted.

See [perception architecture and API references](docs/ARCHITECTURE.md) and [validation protocol](docs/VALIDATION.md).
