## 2026-08-14 · born · judging whether Claudinite is current here (#836)
- **Source:** the pack's first RULES.md, written with the pack.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Judging whether Claudinite is current here".
- **Landed:** #836 (Closes #835, phase 1).

## 2026-08-19 · reworded · freshness is a version comparison, not the stamped ref's age (#1024)
- **Reason:** the versioned update flows stamp versions and deliberately never rewrite `ref` or
  `updated`, so on a maintained member those two hold the provenance of the last full re-vendor and
  a member converging nightly reads as weeks stale.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1024 (Refs #1023).

## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
