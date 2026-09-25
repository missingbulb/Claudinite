## 2026-07-12 · born · Structure-review cleanups: co-locate pack tests, catalog drift-guard, doc/helper homes (#237)
- **Reason:** the pack table was missing 7 of 17 packs and the skills list 11 of 14, and nothing
  would have caught the next drift either.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check catalog-completeness, in packs/basics/catalog-completeness.mjs.
- **Landed:** #237, closing #236 and #216 · pack version 1.
