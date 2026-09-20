## 2026-09-01 · born · converted from references.md (RULES-67)
- **Reason:** #922: a stale tracking ref makes git count the pre-squash commits as unpushed, so the
  next push is rejected and the stop hook reports local work that does not exist.
- **Mechanism:** prose
