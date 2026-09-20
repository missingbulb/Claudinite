## 2026-09-15 · born · converted from references.md (RULES-90)
- **Reason:** #1890's rebase onto a `main` that had moved 54 commits: the branch renamed
  `public/scheduler-run.mjs` to `src/schedule/run.mjs`, git raised the conflict at the old path, and
  resolving it in favour of the shim dropped #1980's `withOwnWrites` hunks entirely — no marker,
  no error, and only that change's own test red out of 3535. The audit that followed checked all
  2140 lines `main` had added to the affected packs since the branch's base and found exactly that
  one loss.
- **Mechanism:** prose
- **Retire when:** Retire the rule if the repo stops carrying long-lived branches that relocate
  files.
