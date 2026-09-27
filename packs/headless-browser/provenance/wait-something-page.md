## 2026-08-16 · born · Claudinite growth: mint the headless-browser canon pack (#905)
- **Source:** three fleet members that drive a browser from their own process, read in full -
  `missingbulb/EdFringeNow`'s pinned-Chromium visual-requirements harness,
  `missingbulb/CrosswordChat`'s browser rasterisation for goldens and generated store artifacts, and
  `missingbulb/ClaudiniteWebsite`'s interactive responsive check. `missingbulb/EdFringeAllocator`
  carries a vestigial fourth instance in a retired prototype, noted and not leaned on.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Wait on something the page itself produces, never on
  the network going quiet.".
- **Landed:** #905 (tracker #642) · pack version 1.

## 2026-09-27 · retired · converted whole into two declared checks
- **Reason:** both halves of the bullet read off the tree, so the findings carry what it said, and
  the deletion test cleared the paragraph. The font half is a second check rather than a second
  assertion because its relevance gate is narrower - tracked reference images - and a declaration's
  gate is whole-spec.
- **Actor:** the canon-prose-to-checks task.
- **Mechanism:** checks headless-browser/networkidle-wait and
  headless-browser/capture-without-font-wait, in the pack's `declared-checks.json`.
