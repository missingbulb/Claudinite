## 2026-09-14 · born · claudinite-tasks: roles as folders, typed world ports, queue frozen as ABI (#1890)
- **Reason:** the tasks pack was a flat tree copied in whole, so every module now sits in the role
  it plays and the graph between the roles is enforced rather than described.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a line match keeping `fetch(`, `process.env`, the child-process import and the
  argless clock read inside the pack's world ports only, so a run can be driven at a chosen instant
  against a fake world.
- **Rejected:** forbidding every `new Date(` rather than the argless read. That would have moved the
  calendar and every ISO-string parse into the ports, which is arithmetic rather than an outward
  edge.
- **Landed:** #1890 (Refs #1869, #1478) · pack version 60914.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
