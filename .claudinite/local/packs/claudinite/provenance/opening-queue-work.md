## 2026-08-24 · born · Claudinite growth: extract lessons (#1310)
- **Source:** the growth-extract run over the window in #1305 - twenty conversation captures across
  the fresh and hindsight passes.
- **Reason:** a session wrote `Closes #1275` on the very issue `converge-item.mjs` parks at
  `needs-human-approval`; the native keyword fires on merge regardless and would have overridden the
  park.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Opening a queue work-item's own delivered PR".
- **Landed:** #1310 (Refs #1305).

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
