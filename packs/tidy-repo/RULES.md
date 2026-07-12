# tidy-repo — the repo tidy-up policy

The nightly PR/branch/issue sweep, active wherever this pack is declared. The fleet routine runs its
three maintenance tasks against a repo; this is the policy they share. The **method** each task
applies lives in [the repo tidy-up spec](../../routines/auto-repo-tidy.md) — Stage 2 moves that method
into this pack's worker docs and skills and retires the standalone spec.

The one rule that shapes everything: **assess PRs and branches read-only; act only on issues.**

- **Branches, PRs — assess only.** They may be work in progress. Report which should stay and which
  are safe to close/delete; **never** delete, push, merge, or close them. Judge by *content* (the
  landed-status test), never a ref's auto-generated name.
- **Issues — act.** Take the first applicable action: close-if-implemented / needs-decision / blocked
  / quick-win / leave. "Implemented in `main`" means the issue's actual ask is true of `main`'s
  content **now** — confirm it there and cite it; when you can't, comment, don't close. Every action
  defaults to the reversible option (comment / leave) when the check is inconclusive.

The standing tracker (one issue per repo, body rewritten to today's state, a dated comment per run) is
owned by the Stage 2 `tidy-report` unit; until then each worker reports its own dimension.
