## 2026-07-22 · born · Per-project scheduling - Phase 0: engine/scheduler, groundwork, checks, task conversions (#396)
- **Reason:** same conversion - the prune stage becomes a task of the repo's own scheduler.
- **Actor:** @missingbulb (owner).
- **Mechanism:** `tasks/growth-dedup/`, declared in the pack's own tree.
- **Landed:** #396 (Refs #394).

## 2026-08-12 · moved · Growth dedup: method moves into a pack skill; growth-write-scope gates the capture runs' write surface (#492)
- **Reason:** the dedup method sat inline in the task doc, so an owner asking in-session to
  reconcile local packs against the canon had nothing to load.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the method moves out of `tasks/growth-dedup/task.md` into the growth-dedup skill,
  body workflow, reached by its description; the task doc keeps the unattended framing.
- **Landed:** #492 (Closes #491).

## 2026-08-16 · policy-changed · growth-dedup: detect the canon's window diff in the task's own prework (#913)
- **Reason:** knowing a canon pack moved says nothing about what moved, so the run re-read the whole
  corpus; the additions and the checks it gained are the high-yield candidates.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a `prework` worker computing the canon window's additions, its brief landing on the
  task's tracker issue because prework has no code-to-agent channel.
- **Landed:** #913 (Closes #912).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · reworded · "baseline" / "baselining" vocabulary retired
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update, and the pack
  every repo declares is basics; the baseline wording named a retired mechanism.
- **Actor:** @missingbulb (owner).
<<<<<<< HEAD
=======
- **Model:** claude-opus-5-5

## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
>>>>>>> b51f2317 (Say "update" where live prose meant the nightly converge)
