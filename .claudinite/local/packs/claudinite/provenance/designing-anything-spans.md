## 2026-07-29 · born · Claudinite growth: conversation extract (#538)
- **Source:** the conversation-extract pass over the sixteen logs captured 2026-07-28; capture
  `2026-07-28T1714Z`, worked issue #520.
- **Reason:** the canon cannot see which repos consume it, so a cross-repo design has to split at
  that line.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Designing anything that spans repos".
- **Retire when:** Retire the rule only if canon gains its own membership read.
- **Landed:** #538.

## 2026-08-16 · moved · Rephrase the local pack's rules: trigger-keyed, and a third the words (#890)
- **Reason:** the file had grown to 57 claim-first entries over 622 lines and ~8,900 words, most a
  title followed by the narrative of the incident behind it. Every rule is re-keyed to the act that
  brings a reader to it, grouped by surface, and cut to the directive plus what it takes to obey it:
  622 lines / 8,870 words to 243 / 2,878, with no rule dropped, weakened or strengthened.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Designing anything that spans repos". it was carried
  by .claudinite/local/packs/claudinite/RULES.md until here; say why the carrier changed.
- **Landed:** #890 (Closes #889).

## 2026-08-17 · reworded · Point every live Sheepdog-repo reference at Shepherd (#957)
- **Reason:** the fleet enforcer is now a separate repository, Shepherd; the retiring one is not a
  rename of it, so prose directing a session at the enforcer pointed at the wrong place.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #957.

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
