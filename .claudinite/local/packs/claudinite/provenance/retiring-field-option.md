## 2026-08-11 · born · Claudinite growth: extract lessons (2026-08-11 window) (#746)
- **Source:** the growth-extract run over the 2026-08-11 window; owner ruling 2026-08-09 on #707,
  capture `2026-08-10T0651Z`, worked issue #708.
- **Reason:** `deprecated-session-scope` was authored as a `basics` check and deleted the same day
  it was reviewed; the tag on the definition plus a comment at each sanctioned holdout does the
  work, and the contract keeps validating the lingering field.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Retiring a field, option or module".
- **Landed:** #746 (Refs #743).

## 2026-08-16 · moved · Rephrase the local pack's rules: trigger-keyed, and a third the words (#890)
- **Reason:** the file had grown to 57 claim-first entries over 622 lines and ~8,900 words, most a
  title followed by the narrative of the incident behind it. Every rule is re-keyed to the act that
  brings a reader to it, grouped by surface, and cut to the directive plus what it takes to obey it:
  622 lines / 8,870 words to 243 / 2,878, with no rule dropped, weakened or strengthened.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Retiring a field, option or module". it was carried
  by .claudinite/local/packs/claudinite/RULES.md until here; say why the carrier changed.
- **Landed:** #890 (Closes #889).

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
