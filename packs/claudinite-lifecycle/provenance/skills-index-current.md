## 2026-09-03 · born · converted from references.md (check:skills-index-current)
- **Reason:** #1648: the owner asked for one readable list of every mounted skill and what loads it,
  generated beside the rules index; a converge that stops leaves it naming skills that are gone or
  missing ones that arrived, which nothing else reports.
- **Mechanism:** a check

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · scope-changed · the skills index moved into .claudinite/flat/ (#2322)
- **Reason:** the path is now read from the engine that writes it, so an older engine's location is
  still the one checked.
- **Mechanism:** unchanged, a coded world check.
- **Landed:** #2322
