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

## 2026-09-21 · policy-changed · a pack's `provenance/` never counts as a shipping change
- **Source:** d63f99c6, which cut chrome-extension 60920.2 for #2180, a pull request touching only
  the pack's provenance files and README.
- **Reason:** the pack-root `provenance/` reaches no member (the vendor set drops it), so a
  backfilled entry or a version-log row changes nothing a version ships; the version log now lives
  there too, so the one exclusion covers both.
- **Actor:** @missingbulb (owner) moved the log; the session that landed it widened the exclusion.
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** `isShippingFile` excludes `packs/<id>/provenance/` whole, structurally, and a
  skill's folder of the same name still ships.

## 2026-09-21 · policy-changed · entry points set exitCode instead of exiting hard
- **Reason:** `process.exit(1)` in an entry point's catch discards whatever stdout has not drained;
  measured here, a run piped to a slow reader delivered 309 of 200,000 lines, while
  `process.exitCode = 1` delivered all of them. The exit status is unchanged; only the output
  survives.
- **Mechanism:** the guard already runs as the module's entry point, so letting the process end
  naturally is enough; nothing waits on the event loop after the catch.
- **Actor:** @missingbulb (owner), replacing #2082 whose diff predated the src/ layout move.
- **Model:** Opus 5
