## 2026-09-11 · born · converted from references.md (RULES-85)
- **Reason:** #1934, 2026-09-11: `update` declared `supersede_existing_pr`, so a member that could
  not land — slow CI, a `needs-human` park, a review gate — collected one obsolete update pull
  request a night, and the one that actually needed attention was never the one in front of anybody.
  Its converge is a full recompute from the base, which is exactly what makes rewriting the standing
  pull request correct rather than lossy.
- **Mechanism:** prose
- **Retire when:** Retire the rule if a task appears whose successive runs produce genuinely
  unrelated answers, where the earlier pull request is worth keeping open beside the new one.
