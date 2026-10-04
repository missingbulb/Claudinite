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

## 2026-10-04 · reworded · a plain move carries main's hunks; only a shim at the old path drops them (#2438)
- **Source:** revalidation probe on git 2.43.0: a branch running `git mv dir new` and editing the
  file, rebased onto a `main` that edited `dir/a.txt`, conflicted at `new/a.txt` (rename paired).
  The same move leaving a shim at `dir/a.txt` conflicted at `dir/a.txt`, and `main`'s hunk never
  reached `new/a.txt`. #1890's original loss was the shim shape.
- **Reason:** the rule claimed every move conflicts at the old path, which a plain move no longer
  does.
- **Actor:** the rule-revalidation run, work item #2438.
- **Model:** claude-opus-5-5
- **Retire when:** the repo stops leaving shims at moved paths, or git pairs a rename while the old
  path is still occupied.
