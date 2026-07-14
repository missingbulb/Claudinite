# tidy-report worker

Reconcile this repo's tidy-up into its standing tracker. Runs **after** this run's `branch-cleanup` /
`pr-assess` / `issue-triage` units for this repo (a per-repo mini-barrier), from their verdicts.

One standing tracker issue per repo, titled exactly `Claudinite tracker: Repo Tidy` — found by that
**exact title, never a fuzzy match**; create it **already closed** if absent (never a fresh issue per
run, never a bare number that can dangle).

**One-time rename (drop once the fleet has converged):** if no issue carries the new title yet, look
for one titled exactly `Repo Tidy Tracker` (the old name) instead. If found, rename it to
`Claudinite tracker: Repo Tidy` and close it if it's open — do this once, then use the new title on
every later run. If neither title is found, create the new one (closed).

Touch it two ways each run:

- **Rewrite the issue body** to today's **dated** snapshot (newest-first): the PRs that should stay
  open, the branches carrying genuine unmerged work plus a safe-to-delete count, and the issue actions
  taken this run. The body is the live picture — it replaces yesterday's, it doesn't accumulate.
- **Add a dated comment** with today's status, so the body's snapshots leave a per-run trail.

Keep both short. **Never open, close, or reopen the tracker** — its state carries no meaning (the body
is the live picture; the state is just however it was created). Every run only rewrites the body and
appends a comment.

`smarts: low` — aggregation and a rewrite, not judgment. Assess-only tasks feed it recommendations; it
records them, it doesn't act on PRs or branches.
