## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check generated-merge-driver, in packs/universal/generated-merge-driver.mjs.
- **Landed:** #128, closing #127 and #131.

## 2026-08-17 · reworded · Move the environment setup script into the web pack, and converge the clone's git config at session start (#956)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #956 · pack version 3.

## 2026-09-06 · reworded · Keep Claudinite's own bookkeeping inside .claudinite/: mount attributes, no README row (#1754)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1754 · pack version 60906.3.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
