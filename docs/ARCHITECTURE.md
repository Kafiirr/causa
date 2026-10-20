# Architecture

## Current runtime

`public/app.js` coordinates presentation and user actions. `public/engine.js` is an immutable state-transition library. `public/rig.js` is a separate simulated environment with a private fault state. Rendering the schematic does not reveal the selected fault.

The engine selects the test with the highest outcome entropy under an explicitly uniform distribution over remaining hypotheses. This is an authored hypothesis model, not a calibrated probability estimate. It first selects the bypass test, then main-valve inspection or pump-operation inspection. Every supported single fault can be isolated in two conclusive observations.

```text
investigating → awaiting_observation → investigating / diagnosed / conflict
diagnosed → awaiting_verification → complete / verification_failed
verification_failed → awaiting_verification
```

An `unknown` observation returns to investigation with candidates unchanged. A contradictory observation produces `conflict`. The simulator's test fixture restores the initial configuration after each diagnostic observation; the bypass is closed for final verification.

Predictions are copied into the event log before observing. Every transition returns a fresh state. Exports include simulation provenance and independently typed camera reference attachments. Records are inspectable local artifacts; they are not signed or tamper-proof attestations.

## Meta perception boundary

`public/perception.js` manages selected captures, explicit analysis, frozen-frame overlays, reviews, and exports. It does not import or mutate the diagnostic engine. `server/perception.mjs` is shared by the loopback Node server and the Sites Worker API routes.

```text
camera / local JPEG or PNG → resized JPEG frame + capture IDs
  → POST /api/perception/analyze (same origin, authenticated)
  → optional operator-selected crop + component role
  → Muse Spark structured visual candidate (original + optional crop)
  → one targeted SAM request, or up to five unique concepts for all six scene roles
  → bounded stream + official @meta-sam/parser → normalized mask paths
  → frozen-frame overlay → operator review → local JSON export
```

`GET /api/perception/status` reports key presence and fixed model names, never key contents. Production identity comes from Sites dispatch. The local server binds to loopback only and injects a development identity; do not expose this development server to a network.

Requests require a recent capture/load timestamp, valid IDs, an inline JPEG/PNG header, matching dimensions, and at most 2.1 megapixels. The gateway hashes the exact bytes. Results bind case, request, frame, task, dimensions, source, and SHA-256. The client checks these bindings and discards results after cancellation, selection changes, or case resets. Timestamps for uploaded images describe loading; original capture age is unknown.

`public/perception-contract.js` shares the allowed component roles and crop geometry rules between browser and gateway. Main and bypass valves have separate IDs. Both UI selectors set the same task, including a full-frame target without a crop. Scene mode covers all six roles rather than two arbitrary model-selected roles.

`server/grounding.mjs` keeps semantic proposals separate from segmentation. Muse returns normalized [left, top, right, bottom] boxes on the original image, visible label/context evidence, and handle type. Unsupported/invisible claims have no box. Valve role grounding requires model-reported readable equipment-label or in-scene-label evidence; this is still an unverified model claim. A selected target's box must mostly lie inside its crop (at least 80% area).

SAM requests are deduplicated by concept, so main and bypass share one `valve` request. Each mask needs support from exactly one same-concept component: a Muse assembly box, a valve handle box, or the true union of tube-section boxes. Its center must lie in a supporting box and at least 65% of its bounding-box area must overlap the support. Union support does not fill gaps or double-count overlapping proposals. Competing boxes, absent proposals, or multiple valve instances assigned to one role cause abstention. These thresholds are authored heuristics, not calibrated confidence or semantic verification. The matcher never assumes upper means main. Unassigned candidates are exported and optionally displayed with generic labels; they are never stamped with the requested role.

The UI distinguishes approximate Muse boxes (dashed component-colored), SAM masks (filled), and operator crop bounds (white). A valid Muse box can be displayed when SAM misses, with separate review fields. A handle-only mask does not establish full valve coverage. Raw concept detections, assignment provenance, and unresolved matches remain in the export. Focused inspections review only the target; full-scene inspections review every role. Repeated non-unknown visibility or direction disagreements on identical image bytes, task, and crop are flagged in the UI.

Muse's schema records component visibility and apparent handle orientation. The gateway always returns physical valve state, pump operation, and flow as unknown. Orientation is retained only for visible/partial valves with a model-described lever handle in usable images. T-shaped, round, or unknown handles are forced to unknown orientation. Raw descriptive text remains an unverified candidate. A reference open/closed state is recorded separately by the operator and never changes model claims or the simulator.

Crops use integer source pixels, minimum 16 × 16, within the original frame. The browser encodes a native-resolution JPEG crop. The gateway checks both image headers and dimensions, hashes both byte sequences, and rejects mismatched task/component roles. Muse sees the original and crop; SAM sees the crop alone. The decoder validates geometry in crop space, then adds the crop origin to boxes. Mask-local paths and dimensions stay unchanged. Results use original-frame coordinates, so the overlay needs no additional crop scaling. The gateway does not decode and pixel-compare crop contents with the original; crop correspondence is client-supplied, operator-reviewed evidence, not an attestation.

The parser handles the official stream grammar and mask encodings; incomplete responses, diagnostics, wrong frame sizes, and out-of-bounds geometry are rejected. Mask allocations are bounded before decoding. Source boxes use inclusive corners on the wire and half-open bounds in the parser; the gateway normalizes them for the overlay. Responses use `causa.perception.v4`; validation exports use `causa.validation.v4` with component-level reviews. The client checks original-frame bindings plus crop role, coordinates, size, and SHA-256 before accepting results. Changing a task or region clears the displayed candidate, retains prior results in export, and requires explicit reanalysis.

A failed SAM call is reported separately from a completed empty result. Neither segmentation nor prose certifies valve position, flow, or successful repair. Candidate observations never eliminate hypotheses or pass functional verification. A later physical adapter needs a separately reviewed observation and measurement contract.

## Storage and privacy

No application database is used. State, up to six resized captures, at most 24 analyses, and operator reviews live in browser memory. Explicit analysis sends the selected image and any selected crop to Meta through the server; raw image data and provider errors are not logged by this application. The server holds request data transiently and does not persist images. Provider/platform retention policies are separate from application storage. Exports include reference image bytes, candidate results, and reviews. These artifacts are inspectable, not signed or tamper-proof.

The camera stops on leaving its view, page hiding, stopping capture, or starting a new case. Analysis is cancelled on navigation, hiding, selection change, or case reset. Cancellation can discard a result after upstream work has already begun; it does not guarantee cancellation of provider billing.

## Verified documentation references

Checked against official Meta documentation on October 18, 2026:

- [Image understanding](https://dev.meta.ai/docs/image-understanding): Muse Spark image inputs.
- [Structured output](https://dev.meta.ai/docs/structured-output): JSON-schema chat completion contract.
- [SAM overview](https://dev.meta.ai/docs/sam/overview): segmentation capability.
- [Reading segmentation](https://dev.meta.ai/docs/sam/reading-segmentation): stream grammar, coordinates, masks, empty results.
- [Client libraries](https://dev.meta.ai/docs/sam/client-libraries): official parser, completed/incomplete outcomes, mask decoding.

Live API access, Muse structured output, and SAM stream/mask decoding have passed smoke checks on synthetic fixtures. Physical equipment accuracy and representative latency/cost remain unvalidated. Automated regression tests continue to use transport mocks; opt-in live checks are separate.

A live request exposed hidden reasoning consuming 1198 of a 1200-token output budget before any usable JSON. Requests now specify `reasoning_effort: "minimal"` and `max_tokens: 4096`, retain fail-closed handling for truncated output, and export reasoning-token usage when provided. See [Meta reasoning documentation](https://dev.meta.ai/docs/reasoning).

### Coverage corrections (v4)

Tubing has up to twelve individual Muse section proposals rather than one box for the network. Assignment tests each section independently, retains unmatched SAM candidates, and never merges empty space between sections. Duplicate identical proposals are removed. A component receives each mask once even when several section boxes overlap it. The UI reports supported/proposed sections; this is not a measure of pixel accuracy or complete network coverage.

Valve proposals separate assembly bounds from handle bounds. A mask with at least 80% of its bounding area inside the proposed handle is flagged as likely handle-only; otherwise a valve mask below half the assembly-box area is flagged as likely partial. These geometric warnings are heuristic and depend on potentially inaccurate Muse proposals. No geometry marks a component complete or verified. Reviews distinguish partial coverage from the wrong component and keep partials in the assessable denominator.

Component colors are shared between dashed proposals and filled masks, with names in an external legend instead of overlapping image captions. Per-component layer toggles remain available. Simulator component details are hidden in camera view; an uploaded outlet is not automatically treated as the simulator collection cup.

### Input detail and proposal-assisted inspection

`public/frame-preparation.js` bounds camera/upload dimensions to 1920 per side and 2.1 MP without upscaling smaller sources. JPEG encoding starts at quality .92 and lowers quality only if the encoded bytes exceed 1.8 MB; oversized inputs fail before transmission. Crops use the same byte bound at native selected-frame resolution.

A user can select a Muse proposal as an inspection crop, with 12% context padding (minimum 8 source pixels) clipped to the frame. Tube sections remain separate. No request is triggered until Analyze is chosen. `focus.selectionMethod` records `muse_proposal` or `manual`, while `source` remains operator-selected: clicking the proposal expresses inspection intent, not verified component identity. Bounds, task/role, image dimensions, and hashes are still validated.

The hosted SAM API currently accepts text concepts only, not visual box/point prompts: https://dev.meta.ai/docs/sam/segmenting . Proposal-assisted inspection crops the submitted image; it does not send a box prompt to SAM.

### Placards, handles, and complementary tubing detection

The prompt distinguishes readable equipment placards (`readable_label`) from dedicated in-scene label panels/annotations (`scene_label`). Either can propose an associated role without requiring lettering on the valve body; scene-label authenticity and physical identity remain explicitly unverified. UI legends and colored model captions are still excluded; role identity remains a model proposal. Handle boxes are valid matching anchors for valves, while ambiguous matches between roles continue to abstain. Matching a handle never proves assembly coverage or physical state.

Tubing uses parallel `plastic tube` and `pipe` requests to cover flexible hoses and rigid sections. Cross-concept boxes with IoU >= .85 are merged, retaining source prompt provenance and all original detections in the response. This is an authored duplicate heuristic, not a confidence score. If one request fails, successful masks survive with an explicit partial-failure notice. There are at most seven total model calls per full scene, three for focused tubing, and two for other focused targets. No automatic retries are introduced.

Unassigned tubing candidates are visible as gray masks by default, separately toggleable and excluded from associated-mask counts. Other unresolved concept candidates retain their optional display. Missing SAM detections, failed calls, and unmatched model proposals remain distinct states.

Small valve parts that already overlap an assembly proposal can use a tentative edge match: padding is capped at 15% of the shorter box dimension, the mask box must be at most half the assembly-box area, and the same overlap/center checks apply. Conflicting role matches still abstain. Such matches retain `muse_box_edge_candidate` provenance, are marked partial, and receive an explicit UI notice. This tolerance addresses approximate box boundaries; it is not a semantic identity guarantee.
