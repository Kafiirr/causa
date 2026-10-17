# Architecture

## Current runtime

`dist/app.js` coordinates presentation and user actions. `dist/engine.js` is an immutable state-transition library. `dist/rig.js` is a separate simulated environment with a private fault state. Rendering the schematic does not reveal the selected fault.

The engine selects the test with the highest outcome entropy under an explicitly uniform distribution over remaining hypotheses. This is an authored hypothesis model, not a calibrated probability estimate. It first selects the bypass test, then main-valve inspection or pump-operation inspection. Every supported single fault can be isolated in two conclusive observations.

```text
investigating → awaiting_observation → investigating / diagnosed / conflict
diagnosed → awaiting_verification → complete / verification_failed
verification_failed → awaiting_verification
```

An `unknown` observation returns to investigation with candidates unchanged. A contradictory observation produces `conflict`. The simulator's test fixture restores the initial configuration after each diagnostic observation; the bypass is closed for final verification.

Predictions are copied into the event log before observing. Every transition returns a fresh state. Exports include simulation provenance and independently typed camera reference attachments. Records are inspectable local artifacts; they are not signed or tamper-proof attestations.

## Future model boundary

The next server-side integration should give Muse Spark access to the equipment schema, approved test catalogue, evidence frames, and remaining hypotheses. SAM 3.1 should provide masks for requested components. Neither segmentation nor model-generated prose alone certifies valve position, flow, or successful repair.

An observation adapter should return a structured envelope:

```json
{
  "testId": "bypass",
  "outcome": "unknown",
  "source": "camera_model",
  "frameIds": ["frame-001"],
  "capturedAt": "ISO-8601 timestamp",
  "reason": "Outlet is occluded. Request another view."
}
```

Do not connect this envelope directly to the current simulation-only observer without adding source validation, frame freshness checks, capture/test identity binding, and explicit uncertainty rules. Keep allowed physical actions in reviewed code. Model proposals cannot introduce arbitrary actions. Functional verification needs validated observations or external measurements appropriate to the rig.

Meta documentation checked while drafting the concept:
- https://dev.meta.ai/docs/overview
- https://dev.meta.ai/docs/media-segmentation

API access, latency, accuracy, and cost on this equipment remain unvalidated.

## Storage and privacy

No database or accounts are needed for this version. State and up to six 960-pixel-wide JPEG captures live in browser memory. The export button downloads a JSON file, including captures if present. There is no upload endpoint. The camera stops on navigation away from its view, page hiding, stopping capture, or starting a new case.
