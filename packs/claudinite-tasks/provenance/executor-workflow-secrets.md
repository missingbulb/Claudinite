## 2026-09-06 · born · Check that the executor workflow passes every declared secret (#1798)
- **Source:** NoRFinder, whose executor carried an empty secrets list against an endpoint declaring
  a token secret, with two queue items parked needing a human.
- **Reason:** a secret reaches a task only if the executor workflow names it statically, and
  `.github/workflows/` is the one directory a converge may not push to - so the file is scaffolded
  once at adoption and every task or endpoint added afterwards declares a secret the job does not
  carry, with nothing saying so until a run reaches the endpoint call. The expectation is recomputed
  from the same two sources the converge reads, so check and converge cannot hold two opinions;
  extra names are not a finding, since a member that dropped a task keeps a harmless line.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a world check, `packs/claudinite-tasks/worldRules/executor-workflow-secrets.mjs`,
  advisory rather than blocking: the remedy is a human-merged pull request to `.github/workflows/`,
  the one fix a member's own machinery cannot make, so blocking would turn such a member red with no
  move of its own to clear it.
- **Landed:** #1798 (Closes #1796) · pack version 60906.8.

## 2026-09-06 · reworded · Hold the executor to its tasks' secrets, not the repo's endpoint tokens (#1832)
- **Reason:** the expectation was the union of the tasks' required secrets and every invocation
  endpoint's token secret, but the list the executor must carry is what the tasks of the repo's
  packs require; an endpoint's token is config rather than a task declaration, and the invocation
  call already names a missing one at the moment of the call. Only the check's list narrows - the
  converge keeps stamping the endpoint tokens, so a member's job still carries them.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1832 (Refs #1831) · pack version 60906.14.

## 2026-09-06 · reworded · Retire the task.mjs module form of a task declaration (#1795)
- **Reason:** the declaration walk the check borrows reads `task.json` alone once the module form is
  gone.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1795 (Refs #1656, #1633) · pack version 60906.15.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
