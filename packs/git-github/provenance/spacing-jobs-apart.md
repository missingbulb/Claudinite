## 2026-08-01 · born · scheduler: let a task claim the run, and have baselining claim it when the mount is overdue (#623)
- **Reason:** the nightly chain staged its stages an hour apart so a repo's mount would be converged
  before anything read it. That hour is a preference, not a guarantee: a run firing hours late after
  dropped fires finds every daily slot due at once and dispatches them together, so the pass that
  converges the mount ran beside the tasks whose ground it exists to repair. The general lesson is
  the guideline; the engine's answer was a precondition that can claim the run.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the github-actions-scheduling skill, triggered on "Spacing two jobs
  apart is not an ordering.".
- **Landed:** #623 · pack version 1.
