## 2026-08-14 · born · canary-probe: an adoptable pack whose one workflow proves the delivery lane (#829)
- **Source:** #649, the problem that `.github/workflows/` is the one directory the nightly update
  cannot push to, and #768, which carried its last open item.
- **Reason:** the update commits with the Action's `GITHUB_TOKEN`, GitHub refuses that token under
  that path, and the refusal rejects the whole ref, so one workflow write fails the entire converge
  rather than one file. The withhold lane answers that, but shipped with one exercised caller, the
  scheduler workflow's own convergence. A record's `materialize` goes through the same `write` and
  had never run against a live member, and nothing in the corpus materialized a workflow into a repo
  that really runs the update flow, so the lane's hard half could not be exercised at all.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** an adoptable pack shipping one inert workflow, `workflow_dispatch` and nothing
  else: what is under test is whether the file arrives, not whether it runs, and a probe consuming a
  member's Actions minutes on every push would be paying for an answer it does not need. Opt-in,
  with `seededByDefault: false` and no fingerprint, so `--init` never seeds it and no scan suspects
  it; the canary is the intended and only holder, being disposable by construction. The two delivery
  routes are deliberate and so is their order: `seedOps` puts the file in at adoption, written by
  the install flow and committed by a session holding a credential the Action token is not, and the
  record re-vendoring the same path through the withhold lane lands at pack version 2. That split is
  load-bearing rather than bookkeeping, because an install stamps the newest version and runs no
  records and `migrationApplies` is `want > have`, so a record shipped in the version a repo adopts
  at is one that repo can never reach. Adopting at 1 leaves the update flow a real gap to close, and
  makes the record update a workflow already present, which is the shape a fleet-wide workflow fix
  would take.
- **Rejected:** a hermetic fixture. The lane's failure mode is a token's refusal on a real push
  against a real repository, which a rehearsal cannot see: a rehearsal proves the staging directory
  got a file, where only a member proves the file arrives in `.github/workflows/`. So the probe had
  to be content a member really declares, and adoptable content in this corpus is a pack.
- **Landed:** #829 · pack version 1.

## 2026-08-20 · moved · Pack reorganization: two collapses and two renames (#1081)
- **Reason:** the pack's subject is a Claudinite feature, so it carries the prefix that says so.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the pack id, `canary-probe` to `claudinite-canary-repo`.
- **Landed:** #1081 · pack version 4.

## 2026-08-21 · policy-changed · Hidden packs: withhold claudinite-canary-repo from the pack directory (#1164)
- **Reason:** the canary is the only intended holder, so offering the pack fleet-wide in the catalog
  a session reads to route a lesson or pick a pack to adopt was noise. It still loads, runs, vendors
  and stays declarable by hand, which is how the canary holds it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `hidden: true` on the manifest, a field this change added to the vocabulary.
- **Landed:** #1164 (Refs #1162) · pack version 60821.1.

## 2026-08-21 · moved · Give each pack a version history file, checked by pack-version-bumped (#1181)
- **Reason:** this pack kept its version history as an inline comment in `pack.mjs`; it goes where
  every other pack's now lives.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the pack's own version history file.
- **Landed:** #1181 · pack version 60821.2.

## 2026-08-24 · reworded · Extract the task surface into claudinite-tasks, move the update flows, split the wiring converge (#1326)
- **Source:** #1317, which retired the withhold lane on the premise that a member's workflow files
  are static after adoption.
- **Reason:** with the lane retired no flow computed or staged a workflow, so the probe exercised a
  delivery route that no longer existed and the manifest says so where an adopter reads it. The pack
  was left standing rather than deleted because what to do with it was a separate call: nothing
  depended on it, and a member declaring it got an inert workflow plus a record no machinery could
  deliver.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1326 · pack version 60824.1.

## 2026-08-31 · reaffirmed · Tell the apply stage to deliver a withheld workflow, not park it (#1540)
- **Source:** #1494's executor line, which disproved the premise the lane was retired on, and #1509,
  which reopened it.
- **Reason:** a member's workflow files are not static after adoption after all, so the withhold
  lane is live and the probe exercises a delivery route that exists. This pack is once more the
  thing that makes a record's `materialize` runnable against a real member.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1540 · pack version 60831.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.
