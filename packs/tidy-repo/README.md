# tidy-repo

The repo tidy-up as a composable pack: the nightly PR/branch/issue sweep, contributed to the fleet
maintenance plan the same way any pack contributes checks and skills. Declaring `tidy-repo` enrolls a
repo in the sweep; removing it is a durable opt-out (baselining never re-adds it).

**Declared pack** — no fingerprint. `bootstrap --init` seeds it into every new repo, and the one-time
`tidy-repo-seed` baseline migration seeds the existing fleet. Carries **no conformance checks** — its
work is maintenance tasks, not checks. Its policy (`RULES.md`): assess PRs and branches read-only, act
only on issues.

## Maintenance tasks

| Task | Runs when | Acts? | smarts |
|---|---|---|---|
| `branch-cleanup` | non-default branches + branch/main activity (or weekly) | assess-only | medium |
| `pr-assess` | open PRs updated, or main moved (or weekly) | assess-only | medium |
| `issue-triage` | open issues updated, or main moved (or weekly) | **acts** (close/label/comment) | medium |

Stage 2 adds a per-repo `tidy-report` reconciliation unit and swaps the whole-repo workers for
single-object skills (`single-branch-status` / `single-pr-status` / `single-issue-triage`).
