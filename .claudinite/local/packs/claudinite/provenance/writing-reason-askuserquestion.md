## 2026-09-16 · born · converted from references.md (RULES-91)
- **Reason:** #2074's fan-out: an option put to the owner argued for scoping a probe cache to the
  collector factory over a process-wide memo *because* "the cache dies with the collector", and the
  owner chose it on that sentence. It was false at `execute/loop.mjs:758`, where one collector is
  built per executor run and drains several items, so a `code_work` step between two picks would
  have been served the old tree — the hazard the chosen option existed to avoid. The coordinator
  messaged the working subagent mid-flight to close it rather than re-ask, and the widening was in
  scope because the owner had approved the reason, not only the shape.
- **Mechanism:** prose
- **Retire when:** Retire the rule if options stop carrying their own rationale.
