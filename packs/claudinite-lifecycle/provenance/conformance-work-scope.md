## 2026-09-01 · born · converted from references.md (check:conformance-work-scope)
- **Reason:** #939: canon content edited without a version move shipped to nobody for five days
  across seven repos while every whole-tree check stayed green — only a change-scoped sweep can
  see "did THIS change move it".
- **Mechanism:** a check
- **Retire when:** Retire the check only if the tree itself can show a missing per-change move.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
