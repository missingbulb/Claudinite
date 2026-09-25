## 2026-07-29 · born · turning a pack on is an interviewed act (#401)
- **Reason:** adopting a pack without answering its questions yields a hollow adoption: a wiki with
  no product, a requirements standard with no test harness. Baking the questions into the manifest
  and enforcing answers on the adding branch puts the interview where the owner is.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a skill in the `grow_with_claudinite` pack, reached by its description, for turning
  packs on in an already-adopted member. Whole-repo bootstrap stays `adopt-claudinite`.
- **Landed:** #401 (Closes #400).

## 2026-08-06 · reworded · the README pack row is seeded at adoption, not on every converge (#662)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #662 (Refs #663).

## 2026-08-14 · moved · into the pack that owns a member's Claudinite status (#836)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the skill moves from `grow_with_claudinite` to this pack, unchanged; adopting a
  pack judges a member's Claudinite status, which is this pack's whole scope.
- **Landed:** #836 (Closes #835, phase 1).

## 2026-08-31 · reworded · the handover issue is written as a checklist (#1532)
- **Reason:** a step's consequences and its closing condition travel below the checklist rather than
  between the boxes, so the list reads as a list.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1532 (Refs #942) · pack version 60831.2.

## 2026-09-06 · reworded · Claudinite's bookkeeping stays inside its own directory (#1754)
- **Reason:** the adoption stops writing a row into the repo's README; mount attributes are
  Claudinite's own record and belong under its own directory.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1754 (Refs #1748, #1750) · pack version 60906.2.

## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).
