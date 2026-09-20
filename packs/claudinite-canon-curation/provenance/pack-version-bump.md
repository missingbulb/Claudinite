## 2026-09-05 · born · converted from references.md (task:pack-version-bump)
- **Reason:** #1482 is what a shared version number cost: two branches each bumped to the same next
  version, both went green, `pack.mjs` auto-merged on identical bytes, and #1466's janitor-rule
  widening reached no member — the fleet swept with the old code while every stamp read current.
  #939 is what no bump cost: seven repos frozen for five days. The checks that asked each pull
  request to bump (`pack-version-bumped`, `pack-version-claimed-once`) were retired for a single
  writer on the base branch (#1723); retire that only if members stop keying re-fetch on `installed
  < canon`.
- **Mechanism:** a task

## 2026-09-20 · policy-changed · its cadence is stated as a UTC period (#2182)
- **Reason:** the per-repo `taskScheduler` anchor let each repo move the boundary its cadence was
  measured against, which put a seam inside every day and never delivered the member-before-canon
  ordering it was kept for (#1995). How often this task runs is unchanged; what "a period" means is
  now the same everywhere.
- **Mechanism:** its `preconditions`, the only gate the scheduler reads, restated from
  `due:<cadence>` to `schedule:at-most-<cadence>`. The old spelling stays accepted permanently, so
  nothing here is a compatibility deadline.
- **Actor:** @missingbulb (owner).
- **Landed:** #2182
