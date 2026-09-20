## 2026-09-01 · born · converted from references.md (RULES-29)
- **Reason:** Learned on `build_vars` / `release-workflows`: a stub is copied into a member's
  `.github/` once and never re-copied, so nothing carries a newly-read key to the repos already
  holding the old copy.
- **Mechanism:** prose
- **Retire when:** Retire the rule only if stubs gain a re-copy path.
