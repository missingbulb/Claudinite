## 2026-09-01 · born · converted from references.md (check:declared-check-spec-keys)
- **Reason:** The engine's declaration load drops a key it cannot place instead of throwing, because
  refusing it wedges a member holding an older engine (#1400); this check is where the typo half of
  that trade is caught.
- **Mechanism:** a check
- **Retire when:** Retire it only if the load can refuse unknown keys again without wedging any
  fleet lane.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
