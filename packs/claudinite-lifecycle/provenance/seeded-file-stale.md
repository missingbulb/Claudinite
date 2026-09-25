## 2026-09-15 · born · telling a member its seeded file has fallen behind the template (#2075)
- **Source:** the canary's dashboard stub went on invoking a module the pack had moved for a day:
  every deploy dying, the task parking on it and reading as broken, and the page serving the last
  tree the old build produced. Three visible faults, one frozen file, and nothing saying which.
- **Reason:** a seeded file is written once, at adoption, and nothing carries a later reshape of the
  template to a member that already has one. The member cannot be fixed automatically; it can be
  told.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a world advisory reading each active pack's own seed operations and comparing the
  member's copy against the template that pack's mount ships, which is its stamped version's
  template. The copy must carry every significant line of the template, so lines the member added
  are its own business and drift means the pack moved and the member did not.
- **Rejected:** a narrower comparison. A member that deliberately edited a template line reads as
  missing it, and advisory is the answer to that rather than a comparison that would go quiet on
  exactly the reshape this exists to catch.
- **Landed:** #2075 (Closes #2069, #2070, #2071) · pack version 60915.4.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).
