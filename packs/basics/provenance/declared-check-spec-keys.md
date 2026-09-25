## 2026-09-01 · born · converted from references.md (check:declared-check-spec-keys)
- **Reason:** The engine's declaration load drops a key it cannot place instead of throwing, because
  refusing it wedges a member holding an older engine (#1400); this check is where the typo half of
  that trade is caught.
- **Mechanism:** a check
- **Retire when:** Retire it only if the load can refuse unknown keys again without wedging any
  fleet lane.

## 2026-09-01 · reworded · Guard the spec-key rule against an engine older than its export (#1549)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1549 · pack version 60901.2.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
