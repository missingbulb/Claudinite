## 2026-09-22 · born · the print-then-exit rule became a check (#2225)
- **Source:** the owner, on #2225: "every task reimplements the same safety mechanisms... are you
  sure there isn't a better way?" The node pack has carried the rule as prose since 2026-09-15, and
  this repo still held 34 print-then-exit sites, one of them a task worker added after the sweep
  #2082 attempted.
- **Reason:** the sweep is not the carrier. #2082 swept the class, #2225 re-derived the same sweep
  against a moved tree, and a new instance had already landed in
  claudinite-growth/tasks/usage-review in between. A rule re-swept by hand every few weeks is a
  check nobody wrote.
- **Mechanism:** a declared `scope: "work"` check here rather than in the canon's node pack, which
  owns the prose: this repo carries no package.json, so the node pack's fingerprint never matches
  and it is not declared - a check placed there would never run in the repo where the drift keeps
  happening. It reads the lines a change ADDS, the moment the defect is authored, so no allowlist is
  owed to the sanctioned holdouts: hook-runner.mjs exits from the write's own callback and the two
  check runners decide their own status. It matches the print and the exit on ONE line, which is how
  every site in this tree spells it.
- **Rejected:** a shared `runAsEntryPoint` helper in engine/, which the two delivery lanes make
  unsafe - the pack lane converges nightly and the engine lane only on a release, so pack files
  carrying a named import of a new engine export would fault the whole pack in every member until
  its engine caught up. Also rejected: making the task runner own the entry point, which reaches
  only 23 of 47 entry points and would need code_work to stop being a command.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5
- **Retire when:** the class is covered where it is authored rather than where it is added - a rule
  that sees a print several lines above an exit, which this line matcher cannot.
