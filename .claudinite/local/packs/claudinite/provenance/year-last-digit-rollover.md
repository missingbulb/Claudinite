## 2026-08-21 · born · Claudinite growth: extract lessons (#1143)
- **Reason:** #1105: a year anchored on its last digit wraps to 0 in 2030 and sorts a decade of
  releases underneath every 2029 one.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule.
- **Landed:** #1143.

## 2026-09-06 · converted · Rules to checks with the four-moment mechanisms: 27 bullets retired across basics, the home pack and canon-curation (#1779)
- **Reason:** the four-moment mechanisms #1711 landed gave the rule a moment that could carry it, so
  the prose was retired by the deletion test rather than kept beside the check.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** check year-last-digit-rollover, in
  .claudinite/local/packs/claudinite/declared-checks.json.
- **Landed:** #1779 (Closes #1760).
