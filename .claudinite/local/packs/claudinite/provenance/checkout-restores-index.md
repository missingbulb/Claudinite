## 2026-08-19 · born · Claudinite growth: extract lessons (#1015)
- **Source:** the growth-extract run over the 2026-08-18 window.
- **Reason:** #1010: `git checkout --` restores from the index, so it destroys uncommitted work in
  the same file just as thoroughly as the `.bak` the restoring rule warns against.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a paragraph of the RULES.md rule on restoring source after a see-it-fail mutation.
- **Landed:** #1015 (Refs #1014).

## 2026-09-06 · converted · Rules to checks with the four-moment mechanisms: 27 bullets retired across basics, the home pack and canon-curation (#1779)
- **Reason:** the four-moment mechanisms #1711 landed gave the rule a moment that could carry it, so
  the prose was retired by the deletion test rather than kept beside the check.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** check checkout-restores-index, in
  .claudinite/local/packs/claudinite/declared-checks.json.
- **Landed:** #1779 (Closes #1760).
