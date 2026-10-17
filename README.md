# CAUSA

**Make the unknown observable.**

A standalone, pre-event prototype for an evidence-first physical diagnostic assistant. The initial application combines a working diagnostic state machine with a simulated irrigation rig and browser camera reference capture.

## Run

Requires Node.js 20 or later. No dependency installation or API key is needed.

```sh
npm start
```

Open http://127.0.0.1:4173. To use a different port, set `PORT`.

```sh
npm test
npm run check
```

Optional browser checks are in `scripts/browser-check.cjs`. With a preview running and Playwright available, run `npm run test:browser`. `PLAYWRIGHT_MODULE` can point to an existing Playwright installation; `CHROME_PATH` can select an installed Chromium browser. Otherwise the script uses Playwright's installed browser. It uses a synthetic camera, writes ignored screenshots and an evidence export to `artifacts/`, and checks all fault paths, camera lifecycle, export, responsive layouts, and case-reset races. `CAUSA_TEST_URL` defaults to the local preview URL. This optional QA dependency is not required by the application.

The `dist` directory is the complete static application. Its ES modules need an HTTP server; opening `index.html` as a local file is not supported.

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
- Camera captures: reference attachments only. They never change diagnostic hypotheses, are not analyzed by a model, and stay in browser memory until explicitly downloaded in an evidence export. Six frames maximum per case; starting another case or reloading clears them.
- Layout B mirrors the presentation of the same reviewed connection graph. This is not evidence of generalization to a new topology.
- Not connected: Muse Spark, SAM 3.1, real sensors, and physical diagnostic procedures. There are no model requests or model credentials in this prototype.

The planner never receives the selected simulator fault. This is separation of application responsibilities, not a security boundary against someone inspecting local browser code.

## Project boundaries

This project uses original source in an independent project directory. It does not import Barzakh code or modify its app, dependencies, contracts, or runtime. The Sites source workflow creates an independent Git repository for CAUSA. The surrounding Barzakh checkout may show this directory as untracked; do not add it as a Barzakh submodule unintentionally.

The interface loads DM Sans and Space Grotesk from Google Fonts, with system fallbacks. Camera frames are not sent to the font provider or any model service.

## Next implementation gates

1. Verify final event rules before deciding what pre-event work can be submitted.
2. Validate a low-voltage rig and expert-reviewed diagnostic procedures. The current fault ontology and predictions are authored assumptions, not learned physics.
3. Add a server-side Meta gateway with secrets kept off the browser. Test Muse Spark image interpretation and SAM 3.1 segmentation on actual rig images.
4. Link model observations to captured evidence, support abstention, and validate observation accuracy before connecting them to elimination or verification.
5. Run blind trials, including unsupported faults and ambiguous views, against a fixed checklist.

See [architecture](docs/ARCHITECTURE.md), [build brief](docs/BUILD-BRIEF.md), and [field rig](docs/FIELD-RIG.md).
