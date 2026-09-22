## 2026-08-17 · born · Claudinite growth: extract lessons (#944)
- **Source:** the growth-extract run over the window in #943 - sixteen commits, fifteen merged pull
  requests and eighteen conversation captures.
- **Reason:** `growth-dedup`'s own brief once rendered 350KB against the ~64KB cap.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Writing generated content into a size-capped GitHub
  API field".
- **Landed:** #944 (Refs #943).

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
