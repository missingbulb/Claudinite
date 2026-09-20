## 2026-09-06 · born · converted from references.md (searching-for-a-tool-1)
- **Reason:** Re-probed 2026-09-15: `select:get_teams` now returns the tool's full schema, as does
  `select:mcp__github__get_teams`, and `get_teams` alone still resolves — so the two forms no
  longer differ and the rule no longer splits them. The 2026-09-06 probe recorded the opposite for
  `select:` with a short name, which is what the skill was written to route around.
- **Mechanism:** prose, a guideline of the searching-for-a-tool skill
- **Retire when:** Retire the rule if `select:` stops accepting either spelling.
