## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check squash-merge-history, in packs/universal/pack.mjs.
- **Landed:** #128, closing #127 and #131.

## 2026-08-16 · converted · The remaining conversion tranches: work scope, and files named by a parsed field (#908)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check squash-merge-history, in packs/basics/declared-checks.json; the work-scope
  vocabulary now carries "merges this change adds, never the base's own".
- **Landed:** #908 · pack version 3.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
