## 2026-08-11 · born · growth-promote: dedupe PR #740's rule additions and cut the language (#751)
- **Source:** the seven growth branches PR #740 merged, re-derived against current `main`.
- **Reason:** reaching for an open-network runner to make the request from somewhere the policy does
  not apply is routing around the boundary rather than answering the question.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule.
- **Rejected:** patching #740's own branch. Its base was 40 commits behind `main` and edited a
  `RULES.md` that still had the engineering-practices bullets in a separate skill file, and its
  merge had left several lessons standing two and three times.
- **Landed:** #751.

## 2026-09-06 · moved · Declared checks at every moment: schema rung, work and action scopes, skill triggers, and the creation path (#1711)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the fetching-from-the-web skill, triggered on "A sandbox or proxy
  denial is a policy boundary, not an obstacle to route around".
- **Landed:** #1711 · pack version 60906.2.
