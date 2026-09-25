## 2026-07-12 · born · Pack discovery: a run_daily task that manifests, suggests, populates and opens a canon PR (#256)
- **Reason:** fleet coverage was measured per repo and never per technology, so a technology no pack
  covered was structurally invisible: its lessons landed only in the project's own docs and the next
  project on the same stack re-derived them.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a scheduled task running the whole pipeline for one member at a time - manifest the
  stack, suggest, populate, open one pull request per authored pack against the canon. An ordinary
  per-member task rather than a bespoke central step, gated on the member's weekly full sweep; over
  a week the staggered sweep covers the fleet, and a shelf-plus-open-PR check keeps first sight from
  double-authoring.
- **Rejected:** conflating the manifest and the suggestion steps. Cataloguing a stack and judging
  whether the canon needs a pack are different levels of analysis and stay sequential.
- **Landed:** #256 (Closes #251, Closes #265).

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
- **Mechanism:** the task's `automerge` declaration, measured against the task's own real pull
  requests with the policy engine rather than predicted.
- **Landed:** #1822 (Closes #1821) · pack version 60906.3.

## 2026-09-15 · policy-changed · Five canon tasks change what they do to their pull requests (#2045)
- **Reason:** each run authors a different pack for a different gap, so folding two rounds into one
  review puts two unrelated packs in front of the owner.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `expected_outcome` moves from amending to `fresh_pr`.
- **Landed:** #2045 (Closes #2042) · pack version 60915.2.

## 2026-09-21 · reworded · Convert the instructions a repo already wrote into its pack (#2191)
- **Reason:** the pack-extraction skill the worker doc names was renamed, its old name having
  described the deliverable it exists to avoid.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #2191 · pack version 60921.2.

## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
