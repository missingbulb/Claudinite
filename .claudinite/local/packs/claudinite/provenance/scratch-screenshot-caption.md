## 2026-09-06 · born · Rules to checks with the four-moment mechanisms: 27 bullets retired across basics, the home pack and canon-curation (#1779)
- **Source:** the conversion pass over `docs/declarative-checks/rule-inventory.md`'s A to D rows,
  bounded to the three packs every session in this repo loads; eighteen bullets left this pack's
  prose, 802 rule tokens for 25.
- **Reason:** the four-moment mechanisms #1711 landed gave each of these rules a moment that could
  carry it, so the prose was retired by the deletion test rather than kept beside the check.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** check scratch-screenshot-caption, in
  .claudinite/local/packs/claudinite/declared-checks.json.
- **Landed:** #1779 (Closes #1760).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
