# CAUSA: hackathon readiness

Assessment date: October 26, 2026. This is a planning assessment, not organizer approval or a claim of eligibility.

## Sources and timing

The participant guide supplied by the owner specifies new event work, a public repository, a three-minute demo, mandatory Meta models, and an exclusion for simple image analyzers. The linked authenticated details page could not be retrieved during this review. The public organizer page confirms the two themes and November 4, 9 PM ET deadline: https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon

The supplied guide calls October 27–November 4 the building period, while kickoff is October 26. Use October 27 as the conservative feature-development start unless organizers clarify otherwise. The existing-codebase exception explicitly mentions startups; ask organizers whether an indie submission may build new features on a disclosed pre-event prototype. Do not assume disclosure alone guarantees acceptance.

## Pre-event baseline

Existing commit: `ea084fdb5c1616b334a5e14e56b2ddec315e4cc9` (October 21, 2026).

Already implemented before the event: the interface, four-cause diagnostic engine, information-gain test selection, simulation, prediction commitments, guided operator evidence, repair and verification forms, evidence export, Muse/SAM gateway, frame overlays, and operator review. These must not be presented as event-built features. The October 26 relocation and this document are administrative work, not new product functionality.

Keep history intact. At submission, list new feature commits/files and show the diff from the baseline. Do not relabel, redate, or recreate old work as new. If reuse is not permitted for the selected track, agree on an eligible fresh scope before implementation.

## Direction and gaps

**Theme:** Push the Frontier. The intended outcome is helping an operator isolate a physical fault, perform a targeted repair, and measure whether operation is restored. Indie versus Startup is a separate track decision based on the entrant's actual status.

The prototype now includes a model-assisted test planner in physical mode. Muse proposes a reviewed informative test using setup notes, reported evidence and available procedures. The operator accepts or declines it; only acceptance commits the authored predictions. Actual observations still come from the operator. This expands model use beyond image annotation, but improvement over the deterministic checklist remains unmeasured.

Implementation and remaining scope (eligibility pending timing clarification):

1. Implemented October 26: structured next-test proposals, validation against reviewed procedures and candidate predictions, explicit acceptance/decline, and exported model input/output/provenance. October 26 work is not automatically eligible under the stated October 27 build start.
2. Use SAM to bind the instruction to the component the operator must inspect. Ask for a better view or confirmation when localization is ambiguous; do not infer flow or pump operation from a still image.
3. Add timestamped before/after evidence for a collection interval and calibrated vessel readings. Keep operator confirmation until measurement accuracy is demonstrated. Preserve disagreements and unsuccessful repairs in the evidence record.
4. Run physical blind trials against a fixed checklist and a version without model assistance. Report diagnosis correctness, test count, time, false completion, abstention, latency, and model cost. Separate simulated, mocked, and physical results.

Prioritize one complete physical investigation over adding more model names or broadening to arbitrary equipment. Do not claim autonomous hardware control, learned physics, or validated general diagnosis.

## Submission gates

- Resolve prototype reuse and exact build-start timing with organizers. Draft question: “For the Indie track, may we reuse a disclosed pre-event prototype if our demo and contribution manifest identify only new October 27–November 4 functionality? Does the October 26 kickoff count as development time?”
- Assemble the rig and review procedures before claiming physical performance; current software checks do not establish this.
- Prepare a public source repository and explicit license for owned code; inspect tracked files and history for secrets and third-party asset rights before publication. A Sites source repository is not evidence of a publicly accessible submission repository.
- Ensure judges can access the demo. The current Sites deployment is owner-private; arrange suitable access before submission without silently changing its audience.
- Record a three-minute video centered on event-built features: problem and disclosure, blind fault, model-guided test, observed evidence, repair, measured check, and honest evaluation results.
- Confirm team members/representative, chosen track, accessible video, and all platform submission fields.

The supplied deadline, November 4 at 9 PM EST, corresponds to November 5 at 9 AM WIB. Aim to submit November 4 WIB. October 26 at noon New York time is 11 PM WIB; the welcome message's “EST” label is inconsistent with its “9 AM PT” equivalent, so verify kickoff against the platform countdown.
