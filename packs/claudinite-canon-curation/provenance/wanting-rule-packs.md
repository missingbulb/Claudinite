## 2026-09-04 · born · converted from references.md (RULES-12)
- **Reason:** Owner decision on the Claudinite canon, recorded as the barriers pack's `goals` answer
  until #1681 retired that question. What the graph is for: keep the engine/content boundary
  structural — core (the engine tree, the workflows, the top-level docs and the shared engine
  modules under `packs/` and `skills/`) must never name a specific pack or skill, because packs and
  skills are discovered content and a core file citing one couples the engine to what it
  distributes. One rule per namespace (`packs/*`, `skills/*`); reviewed inherent couplings live in
  each rule's `except`. A shelf's `migrations/` tree is deliberately NOT core: a migration record is
  a dated one-off that exists to move the fleet off a specific pack's old shape, so naming that pack
  is its purpose rather than a coupling — and records accumulate as dated folders, one per change,
  which no path-keyed exception list should have to chase.
- **Mechanism:** prose
- **Retire when:** Reaffirm while a canon distributes discovered content its engine must not name.

## 2026-09-25 · reworded · "baseline" / "baselining" vocabulary retired
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update, and the pack
  every repo declares is basics; the baseline wording named a retired mechanism.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
