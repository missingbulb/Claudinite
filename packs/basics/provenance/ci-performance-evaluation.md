## 2026-08-16 · born · Where CI time goes: fixture signing, the fleet-wide numbers, and a weekly measurement (#857)
- **Reason:** the order the measurement steps happen in is what the investigation kept getting
  wrong: a local profile dominated by a cost CI does not have, and a file-level win that vanishes at
  suite level.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the ci-performance-evaluation skill, body workflow, reached by its description.
- **Landed:** #857, fixing #855 · pack version 3.

## 2026-09-14 · reworded · Member-facing Actions cache advice: node setup step, CI profiling split, scoping gotchas (#2022)
- **Reason:** #2012's run ledger: the canon's CI spends 11s of 150s in checkout and setup-node
  against 131s of tests, so profiling was right there, but the skill had no branch for the other
  shape, a run whose install dwarfs its suite.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Retire when:** the step-1 breakdown grows a mechanised classifier that routes the two shapes
  itself.
- **Landed:** #2022 · pack version 60913.3.

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).
