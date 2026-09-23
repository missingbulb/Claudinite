## 2026-08-14 · born · prose-to-checks: the task declaration must agree with its own folder (#805)
- **Reason:** task discovery is fail-soft per task, so a declaration disagreeing with its folder
  never runs and nothing goes red; caught at author time instead.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check task-declaration-matches-folder, in
  packs/claudinite-growth/worldRules/task-declaration-matches-folder.mjs.
- **Landed:** #805 (Refs #630).

## 2026-09-06 · scope-changed · Retire the task.mjs module form of a task declaration (#1795)
- **Reason:** `task.json` is now the only declaration file a task folder may carry.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the check parses `task.json` only, the module form having been retired.
- **Landed:** #1795 · pack version 60906.8.
