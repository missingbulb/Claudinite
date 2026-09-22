## 2026-07-12 · born · Stage 1 spec: code planner for the fleet daily maintenance routine (#242)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a scheduled task, registered through the pack manifest's maintenance seam so the
  engine discovers it with no orchestrator edit. This is the earliest commit whose diff names the
  task; what preceded it under `growth/` the evidence here does not reach.
- **Landed:** #242 (Refs #241).

## 2026-09-01 · policy-changed · Weekly-task preconditions: dormant members, and the local-pack question nobody needed to ask (#1563)
- **Reason:** adoption seeds every member's local pack and the nightly never re-seeds or removes it,
  so the presence probe answered yes for everyone and a member that had captured nothing read as
  present with an empty corpus. The directory was tested when the thing that is empty is the
  content.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the precondition stops filtering members on `hasLocalPacks` and participates a
  member on its declaration alone; the fleet signal now skips dormant members beside the fork and
  archived ones, so a dormant member costs neither an opus sweep nor the per-member probes.
- **Landed:** #1563 (Closes #1562) · pack version 60901.3.

## 2026-09-03 · reworded · A task doc opens on what the run does (#1651)
- **Reason:** the opening told the run where it sat in a lifecycle or argued for its own existence,
  neither of which an unattended run acts on, against the checklist altitude `unattended-agents`
  sets for these docs.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1651 (Closes #1649) · pack version 60903.3.

## 2026-09-06 · policy-changed · Give the three canon-curation PR tasks an automerge policy (#1822)
- **Reason:** the two stages were the only pull-request-producing tasks on the shelf with no policy,
  so every pull request they opened parked for approval by construction. The owner was asked to
  reconsider on the ground that each task's own description says its pull request is reviewed, and
  reaffirmed; the resolution honouring both is a narrow policy, since a policy is "merge if the diff
  is exactly this shape" rather than "merge". The owner then took both stages back to manual
  approval, declared as an explicit "nothing" rather than left absent, so the declaration says the
  choice was made.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the task's `automerge` declaration, measured the same way. Measuring also found
  what actually parked this task: its worker doc told the run to bump every edited pack's version
  and claimed a Stop sweep reds on a pack edit that leaves the number alone. Neither is true - the
  version-bump task is the one writer of that number - so the instruction came out.
- **Landed:** #1822 (Closes #1821) · pack version 60906.3.

## 2026-09-21 · reworded · Convert the instructions a repo already wrote into its pack (#2191)
- **Reason:** the pack-extraction skill the worker doc names was renamed, its old name having
  described the deliverable it exists to avoid.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #2191 · pack version 60921.2.
