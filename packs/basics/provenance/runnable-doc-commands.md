## 2026-08-31 · born · Address operational-doc commands from the file's own directory (#1477)
- **Reason:** nothing opens a path written in prose until an agent follows it, which is how four
  dead command paths sat in the routine endpoints for two months with nothing red. Blocking, and
  seen failing on all four live occurrences before the fix.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check runnable-doc-commands, in packs/basics/worldRules/runnable-doc-commands.mjs.
- **Landed:** #1477 · pack version 60830.5.

## 2026-09-06 · reworded · Move task design docs into packs/claudinite-tasks/docs/, carved out of the vendor set (#1813)
- **Actor:** @missingbulb (owner).
- **Landed:** #1813 · pack version 60906.7.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
