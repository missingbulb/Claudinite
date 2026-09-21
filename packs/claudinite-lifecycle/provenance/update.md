## 2026-08-12 · born · the member converges itself from canon (#783)
- **Source:** the last unbuilt piece of the versioned-update design.
- **Reason:** the worker clones canon fresh and executes the clone's flows rather than the mount's
  stale copies, and the engine flow runs before the pack flow, because a pack declares the minimum
  engine it runs on and running packs first would check every one against yesterday's engine.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a scheduled task in the `basics` pack, two-staged like the mechanism it replaced,
  delivering on a dated branch and acting on the flow's own terminal.
- **Rejected:** improving on the older worker's I/O half. It is the proven pattern, and a cleverer
  second shape would be a second set of the same bugs.
- **Landed:** #783 (Refs #768).

## 2026-08-15 · moved · into the pack that owns a member's Claudinite status (#844)
- **Reason:** the move was deliberately held back one change. A member runs the task from its
  vendored copy and discovery finds only a literally declared pack's tasks, so moving the directory
  before every member's declaration carried this pack would have left a member with no update task
  and nothing that could deliver it one.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the task directory moves from `basics` to this pack, once the forced fleet pass was
  read back per member.
- **Landed:** #844.

## 2026-08-19 · reworded · the converge PR title summarizes instead of enumerating every pack (#1048)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1048 (Refs #1045) · pack version 9.

## 2026-08-24 · policy-changed · the precondition stops guessing whether the member is behind (#1348)
- **Reason:** canon's versions are unavailable to a scheduler run, and the local-movement proxy that
  stood in for them declined updates on members that were four packs stale.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the task's precondition, which no longer tries to predict the answer its own run is
  the only thing that can read.
- **Landed:** #1348 (Refs #1344) · pack version 60824.4.

## 2026-09-02 · policy-changed · it converts to an unconditional precondition (#1578)
- **Reason:** the input is the canon, which moves when this repo does not, so no repo-side condition
  may gate it. A repo with no vendored mount names the task in its disabled list rather than having
  the task re-ask nightly.
- **Actor:** @missingbulb (owner).
- **Mechanism:** `preconditions: ['none']`, with the worker stamping a task trailer on the commits
  and merges it makes so the converge reads as machinery to every movement-gated task.
- **Landed:** #1578 · pack version 60902.1.

## 2026-09-05 · policy-changed · it declares supersede_existing_pr and takes the executor's branch (#1695)
- **Reason:** the incumbent pull request's disposal is the executor's target resolution now, so the
  worker pushes to the branch it is handed rather than minting its own.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the task's `expected_outcome`, and the worker reading the target branch the
  executor passes in.
- **Landed:** #1695 · pack version 60905.1.

## 2026-09-11 · policy-changed · the apply stage runs the repo's own tests and reuses the open PR (#1933)
- **Reason:** a converge that lands without the member's own suite having run is a delivery nobody
  checked, and a fresh pull request per cycle buries whatever needed attention in the last one.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the task's apply stage and its pull-request disposal, with the diff's predicted
  shape stated as its automerge policy.
- **Landed:** #1933 (Refs #1932, #1934) · pack version 60911.1.
