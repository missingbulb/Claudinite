## 2026-09-17 · born · converted from references.md (check:work-request-not-started)
- **Reason:** The reword alone had a poor prior: the session-summary directive it fixes had already
  been reworded once for the same class of failure (sessions reciting the directive instead of the
  line), and the failure returned in a new shape. The gate is the declared class rather than a
  length threshold because measuring "no substance" means stripping the announcements, which would
  copy the summary's wording into this pack. Sized against the 692 captured sessions on
  `conversation-logs`: none reached Stop having made no tool call, so the rule is silent on every
  session that did any work.
- **Mechanism:** a check
- **Retire when:** Retire if a legitimate working session can end without calling a tool.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
