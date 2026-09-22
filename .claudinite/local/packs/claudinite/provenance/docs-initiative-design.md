## 2026-08-22 · born · Claudinite growth: extract lessons (#1197)
- **Source:** the growth-extract run over the 2026-08-22 window.
- **Reason:** a built system's design doc restates what its module headers and pack READMEs must
  independently carry (#1169).
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "A docs/<initiative>/DESIGN.md whose system is now
  built".
- **Retire when:** Retire the rule only if design docs stop being duplicated by the headers and
  READMEs the build produces.
- **Landed:** #1197 (Refs #1196).

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
