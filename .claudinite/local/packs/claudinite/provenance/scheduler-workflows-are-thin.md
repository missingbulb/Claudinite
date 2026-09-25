## 2026-08-23 · born · Make the scheduler and executor workflows thin wrappers over engine code (#1290)
- **Reason:** `.github/workflows/` is the one vendored path a converge cannot push into, so every
  line of logic or prose there costs a fleet-wide human-merged pull request; the two files carried
  ~90 lines of comment and three inline `github-script` programs.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a world-scope blocking rule refusing `actions/github-script` and a block `run:` in
  both stubs and both of the canon's own copies - all four surfaces, not one of two.
  .claudinite/local/packs/claudinite/worldRules/scheduler-workflows-are-thin.mjs.
- **Landed:** #1290 (Closes #1289).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).
