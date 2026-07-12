# branch-cleanup worker

Assess the branches in `targets.branches` (the orchestrator hands you the list — you don't enumerate).
**Assess-only: never delete, push, or merge.**

For each branch, apply the landed-status test from [the repo tidy-up spec](../../../routines/auto-repo-tidy.md)
(judge by content, never the ref's auto-generated name): merged ⇒ in `main`; empty diff vs `main` ⇒
stale; intent present in `main` under another path/form ⇒ superseded (grep the concept); no
merge-base ⇒ orphaned, needs a human; else ⇒ genuine unmerged work.

Report, one line each, only the branches with **genuine unmerged work** (`` `branch` — what it
carries``); collapse the rest into one `Safe to delete: N — a, b, c` line. Recommend deletions;
never perform them.

Run on the `smarts: medium` tier — the superseded/orphaned calls are judgment.
