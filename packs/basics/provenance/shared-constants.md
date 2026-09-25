## 2026-07-07 · born · Drift guards: sharpen the single-source rule and ship the shared-constants check (#148)
- **Source:** GoogleCalendarEventCreator's bespoke `shared_constants` test, generalized so every
  repo gets it instead of reinventing it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** check shared-constants, in packs/basics/worldRules/shared-constants.mjs.
- **Rejected:** shipping it as a `design` skill. The rule's true trigger is writing or editing code,
  which the engineering-practices trigger already covered, and a broad skill would have fired at the
  wrong moments.
- **Landed:** #148, closing #147.

## 2026-07-08 · reworded · shared-constants: flag entries whose files can all share an import (#186)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #186.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
