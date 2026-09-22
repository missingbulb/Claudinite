## 2026-08-21 · born · Claudinite growth: extract lessons (#1143)
- **Source:** the growth-extract run over the window in #1141 - fifteen commits, seventeen merged
  pull requests and both conversation windows.
- **Reason:** recency is what resolves an anaphoric reference to the payload, so the literal string
  goes once and last.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Designing text that instructs a model to echo an
  exact string".
- **Landed:** #1143 (Refs #1141).

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
