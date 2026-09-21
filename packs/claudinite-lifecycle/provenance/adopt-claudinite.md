## 2026-09-01 · born · converted from references.md (adopt-claudinite-1)
- **Reason:** #1167 is where the executor-routine hand-over was settled: `create_trigger` and the
  SETUP block are the session's own work, and only the `CCR_ROUTINE_TOKEN` secret remains a human
  step.
- **Mechanism:** a step of the adopt-claudinite skill, a workflow

## 2026-09-21 · reworded · adoption now offers to convert the instructions already written (#2190)
- **Reason:** a repo adopting usually arrives with a CLAUDE.md, and nothing asked about it, so its
  rules were either left loading in every session forever or copied into a pack by hand by a later
  run. Adoption is the one moment the owner is present by construction and the conversion can ride
  the interview's existing batched pass and land in the same PR.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5
- **Landed:** #2190
