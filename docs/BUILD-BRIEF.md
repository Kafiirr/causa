# CAUSA — build brief

## Product idea

CAUSA is a visual diagnostic agent that helps people investigate physical equipment using a camera. It records predictions before tests, ties observations to evidence, and checks restored operation against explicit criteria. The proposed theme is Push the Frontier. Team track remains to be selected based on the entrants' status.

## Application draft

We propose CAUSA, a visual diagnostic agent combining Muse Spark's multimodal reasoning with SAM 3.1 object segmentation. CAUSA will connect troubleshooting instructions to actual components, record predicted outcomes for competing hypotheses before each diagnostic action, observe the result, and update its investigation. It will check restored operation against explicit completion criteria and preserve an inspectable evidence trail. Our target demonstration uses a low-voltage irrigation rig with four controlled faults. An independent participant will introduce a fault without revealing it to the system, and CAUSA will guide the investigation and repair. We will evaluate diagnosis success, unnecessary actions, and false completion claims against a fixed checklist. Initial intended users are small equipment suppliers and technicians providing remote support.

This is a proposal, not a claim that the model integrations or physical validation have already been completed. The current pre-event prototype is simulation-based. Final event rules must determine what existing work may be included.

## Ten-day execution plan

- Days 1–2: validate hardware, supported observations, models, and test procedures.
- Days 3–5: connect perception to the diagnostic runtime; test uncertainty and evidence binding.
- Days 6–7: integrate camera guidance and measurement-based verification.
- Days 8–9: run blind evaluation and fix observed failures.
- Day 10: rehearse and record the working demo.

## Evaluation protocol

Use four supported faults and at least two reviewed arrangements, with five randomized trials per combination. Keep the inserted fault hidden from the system. Add separate unsupported and multiple-fault cases to test abstention; do not include them in an in-domain success headline without labeling them.

Compare with a fixed troubleshooting checklist, controlling for operator familiarity and order effects. Record diagnosis correctness, test count, unnecessary actions, time, false completion claims, abstentions, and model cost per investigation. Retain the full results and failure examples. Do not present simulated results as physical performance.

## Demo outline

1. Show the working rig and the functional success criterion.
2. Have an independent operator introduce a supported fault privately.
3. Show alternative explanations and a committed prediction.
4. Perform the selected test, show the observation, and update hypotheses.
5. Apply the supported repair and measure restored output.
6. Inspect the evidence trail, including unresolved observations if any.

## Scope

The initial product supports a reviewed equipment family, single-fault assumptions, and explicit tests. Universal machine diagnosis, learned physics, autonomous hardware control, and deployment to customer equipment are future research and engineering work.
