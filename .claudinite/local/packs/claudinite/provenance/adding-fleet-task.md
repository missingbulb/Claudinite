## 2026-09-01 · born · converted from references.md (RULES-40)
- **Reason:** The target list is enumerated over `FLEET_GITHUB_TOKEN` while the routine's repo scope
  is hand-typed UI config no Action can read, so the drift completes silently and the run files a
  report that reads as a full sweep.
- **Mechanism:** prose
- **Retire when:** Retire the rule only if that scope becomes machine-readable.
