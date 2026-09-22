## 2026-07-26 · born · Consolidate #453 / #441 / #434 / #437 / #456 / #447 into one PR (#462)
- **Reason:** A mount-shaped path works on every member and fails on exactly this repo, which runs
  the same code from the repo root — the one place where the breakage surfaces last.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule.
- **Landed:** #462.

## 2026-08-16 · reworded · Rephrase the local pack's rules: trigger-keyed, and a third the words (#890)
- **Reason:** the file had grown to 57 claim-first entries over 622 lines and ~8,900 words, most a
  title followed by the narrative of the incident behind it. Every rule is re-keyed to the act that
  brings a reader to it, grouped by surface, and cut to the directive plus what it takes to obey it:
  622 lines / 8,870 words to 243 / 2,878, with no rule dropped, weakened or strengthened.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #890 (Closes #889).

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
