## 2026-08-18 · born · Task-owned trackers, and no fallback for a missing required input (#941)
- **Reason:** an agentic phase has no `throw`, so the worker doc is the only thing that can supply
  the stop; unsaid, a missing input invites the run to improvise another run's inputs.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "An agentic phase states
  the inputs it requires, and a missing one stops the run - never a fallback.".
- **Landed:** #941 (Refs #940).
