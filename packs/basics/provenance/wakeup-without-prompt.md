## 2026-09-06 · born · Declared checks at every moment: schema rung, work and action scopes, skill triggers, and the creation path (#1711)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** check wakeup-without-prompt, in packs/basics/declared-checks.json.
- **Landed:** #1711 · pack version 60906.2.

## 2026-09-06 · reworded · Make a blocking action check date itself (#1787)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1787 · pack version 60906.4.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
