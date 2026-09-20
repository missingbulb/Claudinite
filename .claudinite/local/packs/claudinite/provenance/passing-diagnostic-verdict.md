## 2026-09-01 · born · converted from references.md (RULES-53)
- **Reason:** #1051: already-printed output survives a `SIGKILL`; a file written on the way out is
  never written at all if the kill lands first.
- **Mechanism:** prose
