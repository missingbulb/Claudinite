## 2026-09-01 · born · converted from references.md (check:task-md-only-when-agentic)
- **Reason:** `task.md` is defined as the spec an agentic session follows, and `README.md` is what
  an agentless worker's human-facing record is called — the naming decision recorded in #1055.
- **Mechanism:** a check
- **Retire when:** Retire the check only if that vocabulary changes.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
