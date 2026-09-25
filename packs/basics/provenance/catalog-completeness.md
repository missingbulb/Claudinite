## 2026-07-12 · born · Structure-review cleanups: co-locate pack tests, catalog drift-guard, doc/helper homes (#237)
- **Reason:** the pack table was missing 7 of 17 packs and the skills list 11 of 14, and nothing
  would have caught the next drift either.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check catalog-completeness, in packs/basics/catalog-completeness.mjs.
- **Landed:** #237, closing #236 and #216 · pack version 1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
