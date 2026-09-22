## 2026-08-24 · born · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** #1051: already-printed output survives a `SIGKILL`; a file written on the way out is
  never written at all if the kill lands first.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Passing a diagnostic verdict out of a subprocess
  that may be killed at its timeout ceiling".
- **Landed:** #1315 (Closes #1312).
