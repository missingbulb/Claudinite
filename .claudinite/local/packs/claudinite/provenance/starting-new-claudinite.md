## 2026-08-18 · born · Claudinite growth: extract lessons (#979)
- **Source:** the growth-extract run over the window in #978 - sixteen commits, fifteen merged pull
  requests and thirteen conversation captures.
- **Reason:** nothing prompts the choice, and getting it wrong costs a move-and-rewrite cycle
  (#934).
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Starting a new Claudinite-facing capability".
- **Retire when:** Retire the rule only if the three distribution models collapse into one.
- **Landed:** #979.

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
