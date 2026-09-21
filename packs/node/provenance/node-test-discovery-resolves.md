## 2026-09-06 · born · Promote the validated survivors of four growth-promote PRs (#1828)
- **Source:** #1303's candidate, re-derived against current `main` rather than rebased, and probed
  in the landing session: 14 tests pass, silent on the real tree, `ci.yml` in scope.
- **Reason:** the half of the prose rule with a signature is that the argument resolve to files that
  exist, a typo'd glob reading as a green run. Watched failing before landing: making
  `resolvesToFiles` always return `true` turned 3 of node's 14 tests red.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** world check `node/test-discovery-resolves`, blocking, stamped `since: 2026-09-06`
  so its advisory grace runs from when it reaches members rather than from its branch's date.
- **Landed:** #1828 (Refs #1715, #1690, #1419, #1303) · pack version 60906.2.
