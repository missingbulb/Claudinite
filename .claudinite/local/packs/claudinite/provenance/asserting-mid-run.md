## 2026-08-20 · born · Claudinite growth: extract lessons (#1083)
- **Source:** the growth-extract run over the window in #1035 - twenty-six commits, twenty-eight
  merged pull requests and thirty-eight conversation captures; the run's own breakdown is on #370.
- **Reason:** a simulator invariant was asserted after the run continued past the moment the state
  held (#1054).
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Asserting a mid-run invariant".
- **Landed:** #1083 (Refs #1035).

## 2026-08-24 · moved · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Asserting a mid-run invariant". it was carried by
  .claudinite/local/packs/claudinite/RULES.md until here; say why the carrier changed.
- **Landed:** #1315 (Closes #1312).
