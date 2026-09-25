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

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
