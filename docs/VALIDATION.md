# Prototype validation

Updated October 18, 2026. These results describe software, simulation, and live API integration checks. They do not establish physical diagnosis or real-camera accuracy.

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

- 19 gateway tests pass, alongside the original 16 engine tests: missing-key behavior with zero upstream calls; authentication and origin checks; frame age, image dimensions, and byte hashes; still-frame abstention; exact Muse/SAM request construction; safe upstream errors; concurrency and rate limits; request-size bounds; split SSE events; incomplete-stream rejection; documented SAM mask decoding; empty-result handling; frame-index and source-size mismatch rejection; pre-decoder allocation limits; task-specific targeting despite unrelated model selections; appearance/state separation; crop bounds, role, byte and dimension binding; original-plus-crop request construction; crop-to-source geometry mapping.
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

## First real-camera evaluation, after assembling the rig

1. Label the two valves MAIN and BYPASS. Fix the camera position and document the actual parts and valve markings. Record the reference valve state from direct physical inspection before asking the model.
2. Collect a held-out set of at least 40 valve frames across open/closed states, two layouts, bright/dim lighting, and frontal/oblique views. Include partial occlusion, blurry images, missing labels, and frames where state is genuinely unknowable. Keep prompt-development images separate.
3. For each frame, run **Main valve appearance** once and record visibility/handle-description agreement, localization agreement, and independently known reference valve state. Evaluate full-frame and operator-cropped runs as separate conditions. Do not repeatedly analyze until the model gives the expected answer. Export each case (six frames maximum).
4. Report visibility and handle-orientation results against independently annotated references, including unknowns and missed components. Report coverage and agreement separately, with distinct-image counts and per-component results. Physical state is always unknown in this version; do not claim open/closed prediction accuracy. Any future state classifier requires documented valve calibration and a separate open/closed/unknown evaluation.
5. Review SAM regions separately. Visual agreement is a usability check, not IoU. For quantitative segmentation, independently annotate the held-out frames and compare raster masks. The current export preserves normalized SVG paths and boxes, not benchmark ground-truth masks.
6. Exercise all inspections: physical valve state, pump operation, and flow must remain unknown from a single still frame even when the hardware looks plausible. Verify that no analysis changes simulator hypotheses or functional-check status.
7. Record actual latency, API usage, and failures. Include no-match, rate-limit, occlusion, and unavailable-service cases. Add real transport fixtures only after stripping credentials and private image data.

This initial sample is exploratory and cannot establish general reliability. Physical diagnosis remains gated on a separate expert-reviewed test protocol and validated temporal measurements; neither operator agreement nor segmentation alone passes that gate.
