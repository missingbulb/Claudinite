## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** a suppression hides the signal instead of resolving it, so it is only ever a
  deliberate, reviewed decision.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Suppressing a warning"; it moved with the pack when
  `universal` became `basics`.
- **Landed:** #128, closing #127 and #131.

## 2026-08-12 · reworded · Rewrite RULES.md as situation-keyed rules, and write down the method (#760)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Suppressing a warning"; it moved with the pack when
  `universal` became `basics`.
- **Landed:** #760, closing #759 · pack version 1.

## 2026-08-16 · reworded · Audit basics/RULES.md, and teach authoring-agent-docs what this rewrite needed (#894)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #894 · pack version 3.
