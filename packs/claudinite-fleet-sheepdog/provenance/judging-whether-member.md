## 2026-08-17 · born · judging whether a member is behind (#958)
- **Source:** the pack's RULES.md rewrite from description into instructions.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Judging whether a member is behind".
- **Landed:** #958 (Closes #954).

## 2026-08-19 · reworded · behind is a version gap, not a ref's age (#1028)
- **Reason:** the sweep measured the age of a member's stamped ref, and the versioned update flows
  never rewrite `ref`. Every member's stamp is frozen at whatever commit first vendored it and ages
  at the same rate, so the whole fleet would have crossed the window on one night and collected a
  drift issue each for a fleet that was, by versions, current.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1028 (Fixes #1025) · pack version 8.
