## 2026-09-07 · born · Gate a member-declaration codemod that ships no apply stage (#1859)
- **Reason:** a codemod rewrites files the member owns, and the member's own tests pin the
  generation before; two records did exactly that, and one of them says the assumption outright -
  "the rewrite is text, and a session has nothing to add". Neither existing gate catches it: no
  canary or fixture local pack carries a task test.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a work-scope blocking rule over the canon's own diff, scoped to the two codemods
  that write a member's `task.json` - two of the corpus's 27 records - because firing on `rewrite`
  would make every migration a migration question.
  .claudinite/local/packs/claudinite/workRules/migration-apply-stage.mjs.
- **Landed:** #1859 (Closes #1858).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
