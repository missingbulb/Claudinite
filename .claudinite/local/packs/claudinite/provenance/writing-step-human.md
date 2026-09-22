## 2026-08-18 · born · Claudinite growth: extract lessons (#979)
- **Source:** the growth-extract run over the window in #978 - sixteen commits, fifteen merged pull
  requests and thirteen conversation captures.
- **Reason:** hyperlink a hand-off step to the deepest settings URL and never list a no-op default
  step (#952); owner-authored.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Writing a step a human must do by hand into an
  issue".
- **Landed:** #979.

## 2026-08-18 · reworded · Apply the owner's review to the lessons #979 landed (#987)
- **Source:** the owner's review of the lessons #979 landed; four dropped, five rewritten, five kept
  as written.
- **Reason:** the owner moved the emphasis to making sure the step is needed at all, and to
  hyperlinking rather than banning the breadcrumb trail.
- **Actor:** @missingbulb (owner).
- **Landed:** #987 (Refs #986).

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
