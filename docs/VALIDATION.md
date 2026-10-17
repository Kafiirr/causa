# Prototype validation

Updated October 18, 2026. These results describe software and simulation checks, not physical diagnosis or live model accuracy. No real Meta API calls were made.

- 16 Node tests passed: all four isolated faults and repairs, information-gain selection, prediction-before-observation ordering, unclear observations, contradictory evidence, verification gating, invalid measurements, wrong repairs, immutable history, unsupported actions, export provenance, and simulator state separation.
- Browser end-to-end checks passed for all four faults in Chrome. A case remains pending after diagnosis and repair until its flow check passes.
- JSON download parsed successfully with the expected event sequence, completion status, and simulation provenance.
- Synthetic browser camera capture succeeded. Reference images appeared in Evidence, and media tracks were stopped when navigating away.
- No page overflow on Investigation, Evidence, or Field kit at 390, 768, and 1440 pixels.
- The mirrored rig layout worked. This is a presentation change, not a new topology.
- Starting a new case during a pending test discarded the old observation.
- No browser JavaScript errors were observed.
- Final typography and diagram refinements were rechecked at the three viewport widths.

The automated camera test uses a synthetic device. Actual phone hardware, permission behavior across other browsers, Meta API calls, and physical rig measurements remain unvalidated.

## Prepared perception integration

- 15 gateway tests pass, alongside the original 16 engine tests: missing-key behavior with zero upstream calls; authentication and origin checks; frame age, image dimensions, and byte hashes; still-frame abstention; exact Muse/SAM request construction; safe upstream errors; concurrency and rate limits; request-size bounds; split SSE events; incomplete-stream rejection; documented SAM mask decoding; empty-result handling; frame-index and source-size mismatch rejection; pre-decoder allocation limits.
- Expanded Chrome checks pass with mocked HTTP responses: explicit analysis only, missing-key disabled state, frozen overlays, model text rendered as text, separate operator review, unclear-review denominator, failure retry, request-binding rejection, frame-linked JSON export, cancellation on case reset, and responsive camera panels at 390/768/1440 pixels.
- The published app contains no mock response mode. Fixtures exist only in tests.
- The production Worker build passes. Live access and accuracy remain untested.

## First real-camera evaluation, after access is available

1. Label the two valves MAIN and BYPASS. Fix the camera position and document the actual parts and valve markings. Record the reference valve state from direct physical inspection before asking the model.
2. Collect a held-out set of at least 40 valve frames across open/closed states, two layouts, bright/dim lighting, and frontal/oblique views. Include partial occlusion, blurry images, missing labels, and frames where state is genuinely unknowable. Keep prompt-development images separate.
3. For each frame, run **Main valve position** once and record observation agreement, region agreement, and reference valve state. Do not repeatedly analyze until the model gives the expected answer. Export each case (six frames maximum).
4. Report the full open/closed/unknown confusion matrix and abstention coverage. Report correctness among assessable, non-abstained predictions separately from overall correctness. Count wrong confident answers explicitly; do not exclude them. Model unknown on a knowable view is an abstention, not an accurate state determination.
5. Review SAM regions separately. Visual agreement is a usability check, not IoU. For quantitative segmentation, independently annotate the held-out frames and compare raster masks. The current export preserves normalized SVG paths and boxes, not benchmark ground-truth masks.
6. Exercise dynamic inspections: pump and bypass must remain unknown from a single still frame even when the hardware looks plausible. Verify that no analysis changes simulator hypotheses or functional-check status.
7. Record actual latency, API usage, and failures. Include no-match, rate-limit, occlusion, and unavailable-service cases. Add real transport fixtures only after stripping credentials and private image data.

This initial sample is exploratory and cannot establish general reliability. Physical diagnosis remains gated on a separate expert-reviewed test protocol and validated temporal measurements; neither operator agreement nor segmentation alone passes that gate.
