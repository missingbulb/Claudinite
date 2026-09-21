## 2026-07-26 · born · prose-to-checks: convert the firebase deploy-layout rules to checks (#451)
- **Source:** the deploy-layout half of the pack's own prose, swept against the check-the-world
  test: a rule constraining a static signature in the repo artifact belongs in a check.
- **Reason:** that a build script is wired as a `predeploy` hook is mechanical - the deploy either
  can ship stale JS or it cannot - so the mandate left the prose whole. It parses `firebase.json`
  rather than grepping it, because the CLI's own semantics decide what a codebase is: `functions` as
  one object or an array, `source` defaulting to `functions` and resolving relative to the config's
  own directory.
- **Actor:** @missingbulb (owner), on the prose-to-checks sweep of 2026-07-26.
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a coded world rule beside the manifest, relevance-first - silent until the repo
  carries a `firebase.json` declaring a functions codebase whose `package.json` is in this checkout,
  so a rules-only or hosting-only Firebase repo never hears from it.
- **Landed:** #451 (tracker #450) · pack version 1.
