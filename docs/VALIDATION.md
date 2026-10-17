# Prototype validation

Validated on October 17, 2026. These results describe software and simulation checks, not physical diagnosis or model accuracy.

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
