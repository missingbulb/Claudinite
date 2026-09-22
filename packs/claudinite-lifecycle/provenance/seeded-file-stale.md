## 2026-09-15 · born · telling a member its seeded file has fallen behind the template (#2075)
- **Source:** the canary's dashboard stub went on invoking a module the pack had moved for a day:
  every deploy dying, the task parking on it and reading as broken, and the page serving the last
  tree the old build produced. Three visible faults, one frozen file, and nothing saying which.
- **Reason:** a seeded file is written once, at adoption, and nothing carries a later reshape of the
  template to a member that already has one. The member cannot be fixed automatically; it can be
  told.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a world advisory reading each active pack's own seed operations and comparing the
  member's copy against the template that pack's mount ships, which is its stamped version's
  template. The copy must carry every significant line of the template, so lines the member added
  are its own business and drift means the pack moved and the member did not.
- **Rejected:** a narrower comparison. A member that deliberately edited a template line reads as
  missing it, and advisory is the answer to that rather than a comparison that would go quiet on
  exactly the reshape this exists to catch.
- **Landed:** #2075 (Closes #2069, #2070, #2071) · pack version 60915.4.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
