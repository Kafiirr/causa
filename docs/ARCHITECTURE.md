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
  → one targeted SAM request, or up to two for full-scene inspection
  → bounded stream + official @meta-sam/parser → normalized mask paths
  → frozen-frame overlay → operator review → local JSON export
```

`GET /api/perception/status` reports key presence and fixed model names, never key contents. Production identity comes from Sites dispatch. The local server binds to loopback only and injects a development identity; do not expose this development server to a network.

Requests require a recent capture/load timestamp, valid IDs, an inline JPEG/PNG header, matching dimensions, and at most 2.1 megapixels. The gateway hashes the exact bytes. Results bind case, request, frame, task, dimensions, source, and SHA-256. The client checks these bindings and discards results after cancellation, selection changes, or case resets. Timestamps for uploaded images describe loading; original capture age is unknown.

`public/perception-contract.js` shares the allowed component roles and crop geometry rules between browser and gateway. Main and bypass valves have separate IDs. The server chooses the SAM target from the inspection or crop, so an unrelated Muse scene selection cannot replace the pump or valve. SAM uses short concept prompts; both valve roles use `valve`. Full-frame valve matches can include either valve and are explicitly identity-unverified. Operator-selected regions narrow the search without proving identity.

Muse's schema records component visibility and apparent handle orientation. The gateway always returns physical valve state, pump operation, and flow as unknown. Orientation is retained only for visible/partial valves in usable images. Raw descriptive text remains an unverified candidate. A reference open/closed state is recorded separately by the operator and never changes model claims or the simulator.

Crops use integer source pixels, minimum 16 × 16, within the original frame. The browser encodes a native-resolution JPEG crop. The gateway checks both image headers and dimensions, hashes both byte sequences, and rejects mismatched task/component roles. Muse sees the original and crop; SAM sees the crop alone. The decoder validates geometry in crop space, then adds the crop origin to boxes. Mask-local paths and dimensions stay unchanged. Results use original-frame coordinates, so the overlay needs no additional crop scaling. The gateway does not decode and pixel-compare crop contents with the original; crop correspondence is client-supplied, operator-reviewed evidence, not an attestation.

The parser handles the official stream grammar and mask encodings; incomplete responses, diagnostics, wrong frame sizes, and out-of-bounds geometry are rejected. Mask allocations are bounded before decoding. Source boxes use inclusive corners on the wire and half-open bounds in the parser; the gateway normalizes them for the overlay. Responses use `causa.perception.v2`; validation exports use `causa.validation.v2` with component-level reviews. The client checks original-frame bindings plus crop role, coordinates, size, and SHA-256 before accepting results. Changing a task or region clears the displayed candidate, retains prior results in export, and requires explicit reanalysis.

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
