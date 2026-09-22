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

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
