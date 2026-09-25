## 2026-08-07 · born · Three-responsibility task machinery: janitor split, precondition-only gating, prework rename, exec-status distillation (#675)
- **Reason:** a task that escapes after its precondition passed hides the decision from the run
  records; the heuristics come from the real violations the audit found.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check task-phase-discipline, in packs/basics/pack.mjs.
- **Landed:** #675.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
