## 2026-09-03 · born · converted from references.md (check:skills-index-current)
- **Reason:** #1648: the owner asked for one readable list of every mounted skill and what loads it,
  generated beside the rules index; a converge that stops leaves it naming skills that are gone or
  missing ones that arrived, which nothing else reports.
- **Mechanism:** a check

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
