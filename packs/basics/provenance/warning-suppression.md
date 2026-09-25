## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** the rule needed a reader that is not a session: a suppression added quietly is exactly
  the one nobody reviews.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check warning-suppression, in packs/universal/pack.mjs.
- **Landed:** #128, closing #127 and #131.

## 2026-08-15 · converted · Six declarative-vocabulary keys and the four conversions they unlock (#845)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check warning-suppression, in packs/basics/declared-checks.json;
  `unlessPreviousLineMatches` states the on-site-reason exemption the deleted module had coded.
- **Landed:** #845 · pack version 3.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
