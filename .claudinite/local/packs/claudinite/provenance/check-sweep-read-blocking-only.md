## 2026-09-15 · born · converted from references.md (check:check-sweep-read-blocking-only)
- **Reason:** #1890 claimed both of its new checks were silent on the moved tree; both were inside
  their two-week `since` grace, so their findings printed as ADVISORY and every read had grepped
  `^\[BLOCKING\]`. Seven real barrier violations were standing behind that filter. The grace window
  is what makes this recurrent rather than a one-off: every extraction run lands checks with `since:
  '<today>'`, so the run that most needs to read its own findings is the one whose findings a
  severity filter hides. Advisory because asking "is anything blocking?" before a push is a
  legitimate read the regex cannot tell apart.
- **Mechanism:** a check
- **Retire when:** Retire the check if the sweep stops holding new checks to advisory.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
