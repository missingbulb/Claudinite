## 2026-08-16 · born · Where CI time goes: fixture signing, the fleet-wide numbers, and a weekly measurement (#857)
- **Reason:** the answer to "where does CI time go" had been a hand-run investigation; the task
  makes the next one a measurement that arrives on its own. Weekly, comparing each workflow's median
  against the previous window and requesting an agent only on a real regression, so a quiet week
  costs no session.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** task ci-performance.
- **Landed:** #857, fixing #855 · pack version 3.

## 2026-08-18 · reworded · Task-owned trackers, and no fallback for a missing required input (#941)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #941 · pack version 5.
