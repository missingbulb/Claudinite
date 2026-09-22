## 2026-08-19 · born · Make the task contract a skill, and fix the framing it still carried (#975)
- **Reason:** a session wanting a job in Actions would otherwise author a workflow, and the vendored
  ones already own the trigger, concurrency, secrets and failure reporting.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Wanting a job to run in Actions".
- **Landed:** #975 (Closes #972).
