## 2026-09-18 · born · Rebuild github-pages as a nightly release task over one deploy workflow (#2101)
- **Source:** the presence half of `static-website`'s departed `sw/release-workflows`, over the one
  workflow this pack still vendors.
- **Reason:** the deploy runs from the repo's own `.github/` because GitHub runs a Pages deploy only
  from a workflow job in the repo's own tree, never from the mount, so the pack holds the template
  and each repo hosts a managed copy. The check holds that copy present, dispatch-only and current,
  and holds every other workflow off the Pages actions, because a second publisher or a push trigger
  deploys a tree with no version cut and no park lane.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, Claude Fable 5.1, per the commit trailers.
- **Mechanism:** a check, blocking at high severity, on the same two-signal relevance gate as
  `gp/site-config`.
- **Retire when:** the vendored surface is replaced by something the member cannot hold a stale copy
  of.
- **Landed:** #2101 · pack version 60917.1.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
