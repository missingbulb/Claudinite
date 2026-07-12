# branch-cleanup worker

For each branch in `targets.branches` (the plan hands you the list — you don't enumerate), run the
[single-branch-status](../../../skills/single-branch-status/SKILL.md) skill to get its verdict.
**Assess-only: never delete, push, or merge.**

Collect the verdicts and report: one line each for the branches with **genuine unmerged work**
(`` `branch` — what it carries``); collapse the rest into one `Safe to delete: N — a, b, c` line;
flag any **orphaned** branch for a human. Recommend deletions; never perform them. These
recommendations feed the repo's `tidy-report`, which records them in the standing tracker.

`smarts: medium` — the superseded/orphaned calls are judgment.
