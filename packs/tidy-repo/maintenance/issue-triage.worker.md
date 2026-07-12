# issue-triage worker

Triage the issues in `targets.issues` (the orchestrator hands you the numbers). This is the one tidy
task that **acts**. Per issue, take the **first** applicable action, per [the repo tidy-up spec](../../../routines/auto-repo-tidy.md):

- Already implemented in `main` → **close** (`completed`) + a one-line comment citing where it landed.
- Conflicts with a current guideline → label `needs-decision` + comment naming the conflict.
- Blocked by another issue → label `blocked` + comment `blocked by #N`.
- Small and quick to do → label `quick-win` + comment scoping it.
- Else → leave it.

**"Implemented in `main`" means the issue's actual ask is true of `main`'s content now** — confirm it
there and cite it; never infer it from a linked PR merging or the issue merely looking done. When you
can't point to it, **comment, don't close** — the reversible option is the default whenever the check
is inconclusive. Create a label if it's missing.

Run on the `smarts: medium` tier — deciding the ask is verifiably true of `main` is the judgment.
