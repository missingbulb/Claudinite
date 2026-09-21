## 2026-08-11 · born · the member adopts what the fleet asked it for (#750)
- **Source:** the enforcer-side agent stage that parked for a human, because a session scoped
  to the enforcer repo cannot act on four member repos.
- **Reason:** the fan-out model is the answer: what crosses a repo boundary is an issue and a
  workflow dispatch, and the agent that adopts runs inside the member, on the ordinary Action token,
  with the repo checked out.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a task in the `grow_with_claudinite` pack whose code-work requests the agent only
  when this repo has an open add-packs work list, so an empty re-fire ends quietly; the agent adopts
  requested entries verbatim and confirms suspicions against the checkout.
- **Landed:** #750 (Closes #749).

## 2026-08-14 · moved · out of the growth pack into this one (#836)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the task adopts packs into a member, which judges and changes that member's
  Claudinite status rather than capturing a lesson.
- **Landed:** #836 (Closes #835, phase 1).

## 2026-08-21 · policy-changed · the work-list issue is the item (#1119)
- **Reason:** the fleet marks an issue in the member, so the member's own scheduler run picks it up
  as an ordinary work item and the wake dispatch becomes a latency nudge rather than the trigger.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the task declares no code-work gate and carries no worker; the marked issue is the
  list it acts on.
- **Landed:** #1119 · pack version 60821.1.

## 2026-08-30 · policy-changed · it lands its pull request instead of holding it for review (#1453)
- **Reason:** the review ceiling existed so a human reviewed a change that switches on new checks in
  the member's CI, and the review never came: one member's adoption sat parked for eleven days and
  never reached the repo it was for. The member's own checks still gate the merge.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the task's outcome ceiling.
- **Landed:** #1453 (Refs #1452, #1453) · pack version 60830.2.

## 2026-08-30 · policy-changed · its automerge policy narrows to what an adoption writes (#1459)
- **Reason:** the whole-tree converge lane is the update task's, and an adoption's diff is
  predictable: the mount's policy sources, the settings update and the regenerated rules index.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the task's automerge policy, stated as a prediction of the diff.
- **Landed:** #1459 · pack version 60830.3.
