## 2026-08-19 · born · Give every pack file one of the four sanctioned shapes (#1056)
- **Reason:** six agentless tasks carried a `task.md` each opening by saying it was not one; the
  file is not inert - the routine contract judges it and every work item names it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** check task-md-only-when-agentic, in
  packs/claudinite-growth/worldRules/task-md-only-when-agentic.mjs.
- **Landed:** #1056 (Refs #1055).

## 2026-09-06 · scope-changed · Retire the task.mjs module form of a task declaration (#1795)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the check parses `task.json` only, the module form having been retired.
- **Landed:** #1795 · pack version 60906.8.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
