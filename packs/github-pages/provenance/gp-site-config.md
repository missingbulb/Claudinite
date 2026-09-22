## 2026-09-18 · born · Rebuild github-pages as a nightly release task over one deploy workflow (#2101)
- **Source:** `static-website`'s `sw/site-config`, which held the same config from #611; the config
  and its check stay with the pack that builds and publishes.
- **Reason:** the publish set is deliberately additive, and the check makes the cost of that choice
  survivable. Additive inverts the failure: a forgotten entry is a missing page, and the check
  catches a path that matches nothing tracked, a tooling directory in the set and a set with no
  `index.html` before any of them reaches the default branch.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, Claude Fable 5.1, per the commit trailers.
- **Mechanism:** a check, blocking at high severity, relevant on either of two independent signals,
  the site config or the vendored deploy workflow: gating on the config alone would let a repo that
  vendored the workflow and never wrote its config pass silently, which is the one case this check
  exists to report.
- **Rejected:** publishing the repo except the tooling, which publishes every draft, note and key
  nobody thought to exclude, and publishes each new one silently the day it lands.
- **Retire when:** the artifact stops being built from an explicit list.
- **Landed:** #2101 · pack version 60917.1.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
