## 2026-09-03 · born · Legacy behaves like deprecated: the guideline, the annotation, and the advisories (#1645)
- **Source:** an audit that found around 28 legacy declaration sites across `engine/` and `packs/`,
  none warning anybody, one carrying a stated end date that had passed six days earlier with nothing
  arranged to notice.
- **Reason:** a tolerance is scaffolding, and the half that reaches its holders was missing: a
  member reading its own task files had no way to learn it was on a shape scheduled for removal, and
  the removal is gated on those members letting go. The rule reads the declaration SOURCE, because
  the contract's door renames the legacy fields away before anything downstream can see them - which
  is exactly what made that tolerance invisible.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a world check, `packs/claudinite-tasks/worldRules/legacy-task-fields.mjs`, advisory
  permanently: the old shape works, so it may never stop a member's build, and it names the edit
  that moves the repo forward.
- **Landed:** #1645 (Closes #1637) · pack version 60903.1.

## 2026-09-03 · reworded · A tolerance retires on a convergence window, not on a census of who still holds it (#1653)
- **Reason:** the tolerances this advisory covers stopped calling themselves permanent: a member's
  task files rename on their own clock, but that clock is a convergence window the change states for
  itself, not a reason for the tolerance to stand forever.
- **Actor:** @missingbulb (owner).
- **Landed:** #1653 · pack version 60903.4.

## 2026-09-05 · reworded · A task declares what its run does to pull requests, and the executor resolves the target once (#1707)
- **Reason:** the retired `none`/`pr` outcome ceilings join the shapes the advisory reports, beside
  `open-pr`/`merged-pr`.
- **Actor:** @missingbulb (owner).
- **Landed:** #1707 · pack version 60905.1.

## 2026-09-06 · reworded · Scheduling is the task's own precondition; the scheduler keeps no state (#1733)
- **Reason:** `frequency` and the `none` gate went behind a door, so the advisory reports them where
  a member's own declaration still holds them.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1733 (Closes #1731, Refs #1725) · pack version 60906.9.

## 2026-09-06 · reworded · Retire the task.mjs module form of a task declaration (#1795)
- **Reason:** with the module form gone the advisory reads `task.json` alone.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1795 (Refs #1656, #1633) · pack version 60906.15.

## 2026-09-22 · severity-changed · the retired field names and outcome ceilings leave this advisory (#1920)
- **Reason:** the contract no longer renames them at the door, so there is nothing invisible left
  for the advisory to surface: a declaration naming `prework`, `after` or `required_secrets` is
  simply missing what it meant to declare, and a retired ceiling is not a legal value. Asking for an
  optional rename would understate both. The frequency branch is untouched and is all this rule
  still reports.
- **Mechanism:** the field-rename branch is deleted from the rule, and its `why` no longer claims
  the two generations it has stopped covering.
- **Actor:** claudinite/engine implement-request run, rebased and reconciled in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1920
