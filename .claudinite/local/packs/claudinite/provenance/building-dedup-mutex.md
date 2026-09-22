## 2026-08-22 · born · Claudinite growth: extract lessons (#1197)
- **Source:** the growth-extract run over the 2026-08-22 window.
- **Reason:** a same-title mutex is blind to two items that write one target under different titles;
  `Blocked-by:` is what serializes them (#1119).
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Building a dedup or mutex over work items".
- **Landed:** #1197 (Refs #1196).

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
