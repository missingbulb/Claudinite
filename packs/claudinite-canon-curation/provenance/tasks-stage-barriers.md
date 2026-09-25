## 2026-09-14 · born · claudinite-tasks: roles as folders, typed world ports, queue frozen as ABI (#1890)
- **Reason:** the tasks pack was a flat tree copied in whole, so every module now sits in the role
  it plays and the graph between the roles is enforced rather than described.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a `forbidReferences` declaration beside the existing pack-independence edge, one
  entry per role boundary, each rule's scope asserted non-empty against the real tree. It lands with
  the tree it judges and is silent on it.
- **Landed:** #1890 (Refs #1869, #1478) · pack version 60914.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
