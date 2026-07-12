# pr-assess worker

Assess the pull requests in `targets.prs` (the orchestrator hands you the numbers). **Assess-only:
never close, merge, or comment on a PR.**

For each PR, apply the landed-status test from [the repo tidy-up spec](../../../routines/auto-repo-tidy.md),
reading status from the commits + diff, never the PR title: merged ⇒ done; empty diff vs `main` ⇒
already landed (stale); intent present in `main` under another form ⇒ superseded; else ⇒ genuine open
work.

Report, one line each, only the PRs that should **stay open** (`#N — why it's live`); collapse the
rest into one `Closeable: #a, #b — merged/superseded/stale` line. Recommend closes; never close a PR.

Run on the `smarts: medium` tier.
