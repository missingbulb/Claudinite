## 2026-07-07 · born · Rewrite generate-project-instructions around facet extraction; seed spec-driven-product (#162)
- **Source:** the second exemplar run, against missingbulb/GoogleCalendarEventCreator, which the
  pull request records as adding this rule to the seed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "A kind may be a singleton.".
- **Landed:** #162 (Closes #161) · pack version 1.

## 2026-07-27 · reworded · Tighten every RULES.md to when + what + one non-obvious fact (#467)
- **Reason:** every rule is cut back to trigger plus instruction plus at most one clause of why;
  what went was consequence prose arguing for the rule rather than enabling it. No rule was merged
  or dropped and the structure maps one to one onto the original.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #467 (Closes #466).
