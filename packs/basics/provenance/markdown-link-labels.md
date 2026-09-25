## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** a Markdown link carries its path twice, in the visible label and in the target, so a
  `sed` anchored on the `](../href)` form rewrites the target and leaves the label reading the old
  path: the doc then points right while reading wrong.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check markdown-link-labels, in packs/basics/worldRules/markdown-link-labels.mjs.
- **Retire when:** Markdown stops duplicating the path across label and target.
- **Landed:** #128, closing #127 and #131.

## 2026-09-04 · reworded · Declarative checks: the four-moment design, the rule inventory, and pass two (derive → quantify) (#1676)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1676 · pack version 60904.1.
