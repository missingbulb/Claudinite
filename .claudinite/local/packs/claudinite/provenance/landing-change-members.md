## 2026-08-07 · born · growth-extract: two lessons from the 2026-08-05/06 window (#679)
- **Reason:** Where a change is uniform by construction — prose, a doc, a move of something
  nothing executes from the mount — forcing delivery buys noise rather than assurance; forcing is
  for changes whose behaviour turns on how members differ.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule.
- **Retire when:** Retire the rule only if the nightly converge stops being the reliable delivery
  path.
- **Landed:** #679.

## 2026-08-16 · reworded · Rephrase the local pack's rules: trigger-keyed, and a third the words (#890)
- **Reason:** the file had grown to 57 claim-first entries over 622 lines and ~8,900 words, most a
  title followed by the narrative of the incident behind it. Every rule is re-keyed to the act that
  brings a reader to it, grouped by surface, and cut to the directive plus what it takes to obey it:
  622 lines / 8,870 words to 243 / 2,878, with no rule dropped, weakened or strengthened.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #890 (Closes #889).

## 2026-08-17 · reworded · Point every live Sheepdog-repo reference at Shepherd (#957)
- **Reason:** the fleet enforcer is now a separate repository, Shepherd; the retiring one is not a
  rename of it, so prose directing a session at the enforcer pointed at the wrong place.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #957.

## 2026-08-18 · reworded · Force fleet delivery only where member variation can break it (#962)
- **Reason:** the rule read as unconditional, and every canon change touches what members receive,
  so taken literally it forced the fleet for a doc edit or a file move. The gate is now the question
  itself: force only where the answer depends on how members differ.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #962 (Closes #961).

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
