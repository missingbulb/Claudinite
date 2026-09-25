## 2026-09-06 · born · Declared checks at every moment: schema rung, work and action scopes, skill triggers, and the creation path (#1711)
- **Source:** phases 2 to 5 of the four-moment declared-checks design, bounded to the three packs
  every session in this repo loads.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** check commit-all-sweeps-edits, in
  .claudinite/local/packs/claudinite/declared-checks.json.
- **Landed:** #1711 (Closes #1699, Closes #1700, Closes #1701, Closes #1702).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
