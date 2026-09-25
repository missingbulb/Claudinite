## 2026-09-06 · born · the work-scope backstop behind the mount's edit guard
- **Source:** `docs/declarative-checks/rule-inventory.md` row 1, "Never edit under
  .claudinite/shared/".
- **Reason:** the PreToolUse guard sees only an agent's own tool calls in a session whose hooks are
  installed, so a script, a `git apply` or a hookless member lands the edit unseen; this reads what
  the branch actually committed.
- **Mechanism:** a coded work rule, not a declaration: `repo-context.mjs` filters the mount out of
  the scanned set, so `changedFiles` never carries a path under it and every path-matching key in
  the declared vocabulary is blind there by construction.

## 2026-09-21 · severity-changed · blocking → advisory, with the update task named as the writer that owns this operation
- **Reason:** rewriting `.claudinite/shared/` whole is precisely what this pack's update task does,
  on every member every night; the only thing separating that from a hand-edit is the `Claudinite
  update` title its worker composes, so a converge under any other title — a hand re-converge, a
  rehearsal's residue, a baselining run — was blocked for performing the update task's own
  operation. Usage bears it out: 23 blocking firings in W38.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5
- **Mechanism:** stays the coded work rule; `severity: 'advisory'`, and the description, `why` and
  `fix` now say outright that the update task does this by design, with "leave it" as the first
  remedy where the branch is converging the mount.

<<<<<<< HEAD
## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
=======
## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
>>>>>>> b51f2317 (Say "update" where live prose meant the nightly converge)
