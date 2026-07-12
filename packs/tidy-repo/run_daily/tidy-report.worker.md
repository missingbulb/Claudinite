# tidy-report worker

Reconcile this repo's tidy-up into its standing tracker. Runs **after** this run's `branch-cleanup` /
`pr-assess` / `issue-triage` units for this repo (a per-repo mini-barrier), from their verdicts.

One standing tracker issue per repo, found **by title** `Repo Tidy Tracker` (open it if absent; reopen
it if it was closed while anything still needs tracking — never a fresh issue per run, never a bare
number that can dangle). Touch it two ways each run:

- **Rewrite the issue body** to today's **dated** snapshot (newest-first): the PRs that should stay
  open, the branches carrying genuine unmerged work plus a safe-to-delete count, and the issue actions
  taken this run. The body is the live picture — it replaces yesterday's, it doesn't accumulate.
- **Add a dated comment** with today's status, so the body's snapshots leave a per-run trail.

Keep both short. Keep the tracker **open** while any PR/branch is closeable or any issue awaits a
decision; else close it (the body still shows the final clean state).

`smarts: low` — aggregation and a rewrite, not judgment. Assess-only tasks feed it recommendations; it
records them, it doesn't act on PRs or branches.
