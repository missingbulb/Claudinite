## 2026-08-20 · born · Claudinite growth: extract lessons (#1083)
- **Source:** the growth-extract run over the window in #1035 - twenty-six commits, twenty-eight
  merged pull requests and thirty-eight conversation captures; the run's own breakdown is on #370.
- **Reason:** a design doc's stated architectural ground was repeated after it had already been
  corrected once (#1069).
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Repeating a design doc's stated architectural
  rationale".
- **Retire when:** Retire the rule only if code-work stops running Action-side.
- **Landed:** #1083 (Refs #1035).

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
