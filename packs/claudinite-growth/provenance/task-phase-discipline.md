## 2026-08-07 · born · Three-responsibility task machinery: janitor split, precondition-only gating, prework rename, exec-status distillation (#675)
- **Reason:** a task that escapes after its precondition passed hides the decision from the run
  records; the heuristics come from the real violations the audit found.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check task-phase-discipline, in packs/basics/pack.mjs.
- **Landed:** #675.
