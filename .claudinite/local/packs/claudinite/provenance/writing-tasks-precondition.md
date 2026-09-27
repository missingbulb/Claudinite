## 2026-07-30 · born · Claudinite growth: extract lessons (#576)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule.
- **Landed:** #576.

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

## 2026-09-27 · retired · the writing-tasks skill now carries it, as the rule itself said it should (#2353)
- **Source:** the growth-dedup run over the window since 2026-09-20; the rule carried its own
  "(portable → claudinite-growth/skills/writing-tasks/SKILL.md)" marker.
- **Reason:** that skill's "Three things are NOT preconditions" names repo shape and standing config
  as the mistake, and its movement-conditions bullet names the built-in terms the rule paraphrased
  as "a touched list, a tip-commit date".
- **Retire when:** already retired. It returns only if the canon skill stops naming either half.
