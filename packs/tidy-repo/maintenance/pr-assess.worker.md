# pr-assess worker

For each PR in `targets.prs` (the plan hands you the numbers), run the
[single-pr-status](../../../skills/single-pr-status/SKILL.md) skill to get its verdict. **Assess-only:
never close, merge, or comment on a PR.**

Collect the verdicts and report: one line each for the PRs that should **stay open** (`#N — why it's
live`); collapse the rest into one `Closeable: #a, #b — merged/superseded/stale` line. Recommend
closes; never close a PR. These recommendations feed the repo's `tidy-report`, which records them in
the standing tracker.

`smarts: medium`.
