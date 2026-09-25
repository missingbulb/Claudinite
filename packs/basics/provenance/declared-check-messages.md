## 2026-08-15 · born · Declarative checks: review document + the implementation it recommends (#839)
- **Reason:** a declared check's message is the whole of what a session sees, and nothing held it to
  a length or stopped one rule repeating its own fix. Blocking, and authored red-first against 17
  findings.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check declared-check-messages, in
  packs/basics/worldRules/declared-check-messages.mjs.
- **Landed:** #839 · pack version 3.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
