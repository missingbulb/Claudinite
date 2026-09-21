## 2026-09-01 · born · Retire jwt-advisory-watch; keeping a pack current becomes canon curation's upstream-watch (#1569)
- **Reason:** a pack's tasks are work every member runs, so a per-pack watcher charged the fleet for
  a duty that is the canon's, and made it unrepeatable - one bespoke watcher per pack that wanted
  one.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a monthly task, named `upstream-watch` at birth, reading the shelf and nothing
  else. A pack opts in with an `## Upstream` section in its README naming what to watch, where it
  publishes and the state it was last reconciled against; presence of the section is the whole
  opt-in and silence is a legitimate answer. Anchors advance only for a source actually read, so a
  refused fetch leaves its window open instead of swallowing it. No signal gates it: the trigger
  lives outside the repo.
- **Rejected:** carrying over the retired task's lockfile scan for libraries inside an advisory's
  range. That is dependency-update tooling rather than pack content, and nothing replaces it.
- **Landed:** #1569 (Closes #1568).

## 2026-09-15 · policy-changed · Five canon tasks change what they do to their pull requests (#2045)
- **Reason:** the task is named for what it does to the shelf - revalidate each pack against the
  sources it declared - rather than for watching something upstream. A month whose pull request
  nobody reviewed is retired by the next month's, which recomputes the same answer from the sources
  and the anchors on the base.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the task is renamed from `upstream-watch` and its `expected_outcome` becomes
  `supersede_existing_pr`. Every live reference follows the name; the version rows and the dashboard
  mock keep the old one, being records of what happened.
- **Landed:** #2045 (Closes #2042) · pack version 60915.2.
