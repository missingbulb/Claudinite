## 2026-09-06 · born · Promote the reviewed survivors of nine growth-promote PRs (#1671)
- **Source:** the nine growth-promote pull requests consolidated here, #1021, #1157, #1204, #1345,
  #1372, #1409, #1451, #1524 and #1661, all closed in favour of this one, each candidate re-judged
  against `main` and written to the `writing-pack-prose` ration.
- **Reason:** the call has a signature the four-moment check vocabulary can carry, and every
  candidate that did rides a check rather than prose.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** declared world check `node/btoa-atob-on-text`, advisory, matching a `btoa(` or
  `atob(` call in a JS or TS source with comments stripped first.
- **Landed:** #1671 (Refs #1202, #1308, #1408, #1435, #1657, #1672) · pack version 60906.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
