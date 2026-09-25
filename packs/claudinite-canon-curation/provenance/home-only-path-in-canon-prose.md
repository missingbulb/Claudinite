## 2026-09-06 · born · Rules to checks with the four-moment mechanisms (#1779)
- **Reason:** the conversion pass over the three packs every session in this repo loads, applying
  the prose-to-checks deletion test to the rows the rule inventory classified as convertible.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a declared world check, blocking, carrying `since: 2026-09-06`. Converted from the
  home-only half of the cross-pack-path rule, which keeps the half a check cannot judge.
- **Landed:** #1779 (Closes #1760, Refs #1672) · pack version 60906.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
