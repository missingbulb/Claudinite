## 2026-09-22 · born · a run raced its own delegated subagent on a duplicate trigger (#1886)
- **Source:** GCEC, where a duplicate dispatch arrived mid-run and the session treated it as a
  competing one: it closed an item and posted reconfirmation comments the subagent was already
  producing correctly.
- **Reason:** a duplicate trigger for an item you already hold is almost always the echo of your own
  claim, so the safe reading is the structural one - check whether the in-flight work is yours
  before acting on the second trigger. Acting first layers real, irreversible side effects (a close,
  a comment) on top of work that was already going to land.
- **Mechanism:** a guideline on this skill, beside the other dispatch-and-subagent rules, since the
  moment it must fire is mid-run and no file edit predicts it.
- **Retire when:** the dispatch channel dedups by claim, so a second trigger for a held item never
  reaches the session.
- **Actor:** claudinite-canon-curation growth-promote run, rebased and resolved in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1886
