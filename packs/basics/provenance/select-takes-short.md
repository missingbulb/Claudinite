## 2026-08-11 · born · growth-promote: dedupe PR #740's rule additions and cut the language (#751)
- **Source:** the seven growth branches PR #740 merged, re-derived against current `main`.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the third of those harness-tool contracts, then reading that only a fully-qualified
  `select:` name resolves.
- **Rejected:** patching #740's own branch. Its base was 40 commits behind `main` and edited a
  `RULES.md` that still had the engineering-practices bullets in a separate skill file, and its
  merge had left several lessons standing two and three times.
- **Landed:** #751.

## 2026-09-15 · reworded · Claudinite canon: rule revalidation (#2058)
- **Reason:** re-probed 2026-09-15: `select:get_teams` returns the tool as readily as
  `select:mcp__github__get_teams`, so the two forms no longer differ and the rule no longer splits
  them. The 2026-09-06 probe had recorded the opposite, which is what the skill was written to route
  around.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a guideline of the searching-for-a-tool skill, triggered on "select: takes a short
  name as readily as a qualified one".
- **Retire when:** `select:` stops accepting either spelling.
- **Landed:** #2058 · pack version 60915.3.
