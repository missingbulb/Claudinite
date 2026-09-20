## 2026-09-01 · born · converted from references.md (adopt-claudinite-1)
- **Reason:** #1167 is where the executor-routine hand-over was settled: `create_trigger` and the
  SETUP block are the session's own work, and only the `CCR_ROUTINE_TOKEN` secret remains a human
  step.
- **Mechanism:** a step of the adopt-claudinite skill, a workflow
