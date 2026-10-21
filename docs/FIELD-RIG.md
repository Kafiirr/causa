# Field rig — planning draft

The hardware has not been purchased, assembled, or validated. This list describes a proposed low-voltage tabletop fixture and does not yet specify compatible part sizes or a verified budget.

| Component | Selection requirement |
| --- | --- |
| Reservoir | Stable, transparent or visibly marked water level |
| Pump | Low-voltage water pump with a suitable USB supply and documented operating limits |
| Tubing | Clear tubing matching the pump and connectors |
| Branch connectors | Split and join a main route and bypass |
| Two valves | Compatible with tubing, independently controlling the branches |
| Collection cup | Visible volume markings for a defined collection interval |
| Tray | Contains the fixture's water volume and keeps electronics away from spills |
| Camera stand | Stable view of components and the collection cup |

```text
Reservoir → pump → split → main valve → main tube → join → collection cup
                      └→ bypass valve → bypass tube ┘
```

Before using real fault procedures, check the pump's dry-running and blocked-flow restrictions. Review each reversible fault and test against those limits. The software simulation's inlet obstruction is not automatically an approved physical test. Start with procedures supported by the chosen hardware and an experienced reviewer.

Mark components by stable identity. An operator must confirm connections during setup. Document the visible observations for each allowed test, how to return the system to baseline, and when to stop or report an unresolved result. Do not claim that a schematic or segmentation mask establishes actual flow.

Simulation uses a demonstration threshold of at least 10 mL/s across at least 10 seconds. Establish the real threshold from repeated healthy-rig measurements before using it in physical trials.

Guided physical mode requires a case-specific flow target and interval (at least 10 seconds), fixed before testing. Notes, configuration confirmations and manually recorded measurements are required; no simulated values are supplied. Frame/review links are optional context. An operator-reported pass is not independent instrument verification.
