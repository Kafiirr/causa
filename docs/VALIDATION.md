# Prototype validation

Updated October 19, 2026. These results describe software, simulation, and live API integration checks. They do not establish physical diagnosis or real-camera accuracy.

- 16 Node tests passed: all four isolated faults and repairs, information-gain selection, prediction-before-observation ordering, unclear observations, contradictory evidence, verification gating, invalid measurements, wrong repairs, immutable history, unsupported actions, export provenance, and simulator state separation.
- Browser end-to-end checks passed for all four faults in Chrome. A case remains pending after diagnosis and repair until its flow check passes.
- JSON download parsed successfully with the expected event sequence, completion status, and simulation provenance.
- Synthetic browser camera capture succeeded. Reference images appeared in Evidence, and media tracks were stopped when navigating away.
- No page overflow on Investigation, Evidence, or Field kit at 390, 768, and 1440 pixels.
- The mirrored rig layout worked. This is a presentation change, not a new topology.
- Starting a new case during a pending test discarded the old observation.
- No browser JavaScript errors were observed.
- Final typography and diagram refinements were rechecked at the three viewport widths.

The automated camera test uses a synthetic device. Actual phone hardware, permission behavior across other browsers, and physical rig measurements remain unvalidated. Separate live API checks are documented below.

## Perception regression checks

- 22 gateway tests pass, alongside the original 16 engine tests: missing-key behavior with zero upstream calls; authentication and origin checks; frame age, image dimensions, and byte hashes; still-frame abstention; exact Muse/SAM request construction; safe upstream errors; concurrency and rate limits; request-size bounds; split SSE events; incomplete-stream rejection; documented SAM mask decoding; empty-result handling; frame-index and source-size mismatch rejection; pre-decoder allocation limits; task-specific targeting despite unrelated model selections; appearance/state separation; crop bounds, role, byte and dimension binding; original-plus-crop request construction; crop-to-source geometry mapping.
- Expanded Chrome checks pass with mocked HTTP responses: explicit analysis only, missing-key disabled state, frozen overlays, model text rendered as text, separate operator review, unclear-review denominator, failure retry, request-binding rejection, frame-linked JSON export, cancellation on case reset, responsive camera panels at 390/768/1440 pixels; visible-miss review accounting; drag and numeric crop selection; crop-hash mismatch rejection; mapped overlay coordinates and toggles; distinct-image counts; region reset on task changes.
- The published app contains no mock response mode. Fixtures exist only in tests.
- The production Worker build passes. Live API integration is checked below; real-camera accuracy remains untested.

## Live activation checks

The local `.env` key was recognized after server startup. The hosted project initially had no runtime secrets; `MODEL_API_KEY` was configured separately as a hosted secret. No key value is stored in source, browser assets, or these reports.

- Authenticated `GET /v1/models` returned HTTP 200 and included `muse-spark-1.3` and `sam-3.1`.
- The original Muse request returned HTTP 200 but `finish_reason: length`, with 1198 reasoning tokens out of a 1200-token budget and no usable JSON. The gateway correctly rejected it. Requests now use minimal reasoning with a bounded 4096-token total output budget; a regression test covers this failure.
- A live check on CAUSA's 839 × 445 schematic completed with `usable: false`, `outcome: unknown`. Muse used 844 input tokens and 546 output tokens, including 298 reasoning tokens. A standalone SAM valve request completed with zero regions. Combined elapsed time was 13,968 ms for that single run.
- A separate SAM request on a deterministic 256 × 256 red-circle fixture returned one nonempty mask. It decoded to a 127 × 127 raster with source bounds `(65, 65)` to `(191, 191)` inclusive. Elapsed time was 2,097 ms for that run. This confirms live stream and mask compatibility, not rig-component accuracy.
- The live local browser flow passed upload, explicit analysis, operator review, frame-bound export, and unchanged simulation state. Muse again abstained on the schematic; that request took 8,248 ms. The synthetic review was marked unclear, not counted as a correct physical observation.
- Offline browser regression tests pass with local credentials present. Their model endpoints are intercepted so normal QA cannot accidentally send images or incur inference charges.

Sanitized local reports are in ignored `artifacts/meta-live-smoke.json`, `artifacts/meta-sam-positive.json`, and `artifacts/meta-live-ui-report.json`. The browser evidence export is also ignored. These single-run timings are diagnostics, not a latency benchmark. A rig is not yet assembled; physical validation is explicitly deferred.

## Targeting and crop integration

The reported reference-image analyses showed Muse describing the pump and valves while SAM returned no regions for those components, alongside unrelated tank/tube overlays. These are integration observations, not verified physical state labels.

- Focused inspections now request their own SAM component. Main/bypass roles are separate, with identity explicitly unverified.
- Per-component reviews preserve visible misses and incorrect regions in the localization denominator. The summary counts distinct image hashes separately from repeated analyses.
- A live original-plus-crop browser check passed with a 180 × 180 synthetic crop. Muse abstained (`usable: false`, physical state unknown), and the targeted pump SAM request completed with zero regions. Review, crop-bound export, and unchanged simulation state passed. This run took 11,667 ms and made two model calls; it validates transport, not a successful pump detection.

## Full-frame role-association correction

The user's October 18 reports exposed three reproducible application defects: the lower component selector did not change full-frame requests, generic valve results were labeled with the requested role, and scene mode silently covered only two selected roles. The reference also exposed model instability in handle descriptions and pump/outlet segmentation misses. Prior API smoke tests did not establish semantic accuracy.

- Both selectors now change the same task and clear stale displays; full-scene coverage includes all six roles, with one shared valve request.
- Tests cover separate main/bypass association, absent/competing/oversized grounding boxes, T-handle abstention, invalid/out-of-crop proposals, and deduplicated scene requests.
- Browser regressions passed selector-to-request binding, stale-overlay clearing, manual marking with AI overlays hidden, numeric/drag coordinates, cancellation, and repeated-claim conflict display. Review and simulation regressions also passed.
- One live full-frame check on the supplied screenshot (including its surrounding UI) completed in 29,748 ms, with six model calls. Both valve masks were assigned to different roles, the outlet received a mask, and seven of eight tube regions matched the proposed tubing bounds. Two raw candidates remained unassigned. Both handles were described as T-shaped with unknown direction.
- A separate 185 × 185 pump-crop check completed in 16,325 ms with two model calls. The crop coordinates/hash were returned correctly; Muse proposed a pump box, while SAM again returned zero masks. Manual region selection changes the input but does not guarantee recognition.
- Two additional standalone SAM prompts, `electric water pump` and `electric motor`, also returned zero regions on the supplied screenshot. No prompt change is claimed to solve the pump miss.
- SAM still returned no pump or reservoir mask in the full-frame run. Muse supplied approximate location boxes instead, explicitly distinguished from masks. This is a remaining segmentation limitation, not a successful SAM detection. The screenshot was a debugging input, not an independent physical-rig test or a calibrated benchmark.

## First real-camera evaluation, after assembling the rig

1. Label the two valves MAIN and BYPASS. Fix the camera position and document the actual parts and valve markings. Record the reference valve state from direct physical inspection before asking the model.
2. Collect a held-out set of at least 40 valve frames across open/closed states, two layouts, bright/dim lighting, and frontal/oblique views. Include partial occlusion, blurry images, missing labels, and frames where state is genuinely unknowable. Keep prompt-development images separate.
3. For each frame, run **Main valve appearance** once and record visibility/handle-description agreement, localization agreement, and independently known reference valve state. Evaluate full-frame and operator-cropped runs as separate conditions. Do not repeatedly analyze until the model gives the expected answer. Export each case (six frames maximum).
4. Report visibility and handle-orientation results against independently annotated references, including unknowns and missed components. Report coverage and agreement separately, with distinct-image counts and per-component results. Physical state is always unknown in this version; do not claim open/closed prediction accuracy. Any future state classifier requires documented valve calibration and a separate open/closed/unknown evaluation.
5. Review SAM regions separately. Visual agreement is a usability check, not IoU. For quantitative segmentation, independently annotate the held-out frames and compare raster masks. The current export preserves normalized SVG paths and boxes, not benchmark ground-truth masks.
6. Exercise all inspections: physical valve state, pump operation, and flow must remain unknown from a single still frame even when the hardware looks plausible. Verify that no analysis changes simulator hypotheses or functional-check status.
7. Record actual latency, API usage, and failures. Include no-match, rate-limit, occlusion, and unavailable-service cases. Add real transport fixtures only after stripping credentials and private image data.

This initial sample is exploratory and cannot establish general reliability. Physical diagnosis remains gated on a separate expert-reviewed test protocol and validated temporal measurements; neither operator agreement nor segmentation alone passes that gate.

## Coverage and presentation correction — 2026-10-19

The v4 contract adds separate tubing-section proposals and valve handle bounds. Regression checks cover multi-section assignment, unrelated candidates remaining unresolved, overlapping proposals not duplicating masks, crop-bound filtering, malformed section rejection, and partial/handle-only warnings that never assert complete coverage. The 25 gateway tests and existing engine suite pass; syntax and TypeScript checks pass. Browser regression checks pass at 390, 768, and 1440 pixels, including multiple-box toggles, partial-coverage reviews, missing-mask reviews, camera/simulator detail separation, and the existing four simulated fault paths.

Two opt-in live debugging checks used supplied screenshots, with six model calls each:

- Earlier black-bench screenshot without AI overlays: 26,465 ms. Muse supplied nine tube-section proposals; five of eight SAM tube masks were assigned, supporting five proposals. Both valve masks were assigned to separate roles and flagged as likely partial. Pump and reservoir SAM masks were absent; outlet had one assigned mask.
- Wood-bench screenshot already containing old AI overlays: 20,345 ms. Muse supplied six tube-section proposals; two of ten SAM tube masks were assigned. Reservoir and outlet each had an assigned mask. Pump and both valve SAM detections were empty. Existing captions and overlays are baked into this input and may confound recognition; this is not a clean-image accuracy comparison.

These checks establish schema/API compatibility, bounded assignment, honest abstention, and presentation behavior. They do not demonstrate full tubing coverage, improved aggregate model accuracy, or physical-rig reliability. Pump segmentation remains unresolved. No reference state or diagnostic-engine state was inferred from these images. Artifacts remain ignored locally under artifacts/.

## Detail preservation and proposal-assisted crops — 2026-10-19

- Three frame-preparation tests cover dimension/pixel limits without unnecessary downscaling, bounded JPEG encoding, and padded proposal crop geometry. A gateway test confirms proposal selection provenance remains operator-selected, not verified identity.
- Browser regression passed, including a 1680 × 1050 upload retaining its dimensions, proposed crop selection causing no automatic Meta request, explicit analysis carrying `selectionMethod=muse_proposal`, crop clearing restoring the prior full-frame result, and the existing simulation/responsive checks.
- Two standalone concept probes on the supplied black-bench screenshot returned zero `motor` masks and three `hose` masks. These offered no demonstrated improvement over the existing concepts, so no automatic alternate-prompt retries were added.
- A focused live pump inspection using the revised image pipeline completed in 12,933 ms with two model calls. Muse supplied a labeled pump location proposal; SAM returned zero pump masks. Higher retained detail is an input-quality improvement, not evidence that pump segmentation is solved.

## Placard interpretation and incomplete tubing overlays — 2026-10-20

The supplied screenshots exposed distinct failures: label panels rejected as UI overlays, valve handle masks excluded by approximate body bounds, and detected tube sections hidden as unresolved. Corrections accept scene-label evidence as unverified role proposals, use handle boxes and bounded tentative edge matches, combine separate tubing sections without filling gaps, and show unresolved tubing masks in gray by default.

A two-call SAM comparison on the third supplied screenshot found eight `plastic tube` regions and six `pipe` regions; the latter included a lower elbow absent from the first set. The application now uses both concepts and deduplicates strongly overlapping boxes, with original detections preserved. This adds one request for tubing/full-scene inspection.

Live debugging checks used screenshots already containing older overlays, not clean originals or physical-rig ground truth:

- Initial second-image check: 28,849 ms, seven calls; bypass received one mask, main label grounding remained unresolved, and three of eleven combined tube candidates were assigned.
- Initial third-image check: 22,077 ms, seven calls; six of ten tube candidates were assigned, while both valve label grounds were withheld.
- After adding explicit scene-label provenance, the third-image check took 19,780 ms, seven calls. Both valve roles received label-grounded proposals. Main received a mask; bypass failed the strict overlap threshold. Three of ten tube candidates were assigned and the rest remained gray unresolved candidates, demonstrating that proposal variability still affects assignment.
- Replaying those stored live valve detections after the bounded edge-match correction assigned exactly one mask to each valve: main by direct box overlap, bypass as a tentative edge match. No new model call was required for this deterministic replay; it is not a fresh end-to-end live success claim.

Gateway tests cover handle-only anchors, ambiguity, union area without double-counting/gap filling, complementary-concept deduplication/provenance, partial upstream failure, scene-label evidence, and bounded valve edge matching. Browser checks cover default-gray unresolved tube masks and their toggle separately from associated-mask counts. Pump masks and complete tubing/valve coverage remain unresolved model limitations.
