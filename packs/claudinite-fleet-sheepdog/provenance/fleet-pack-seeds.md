## 2026-08-08 · born · the pack-seed sweep, naming no pack (#567)
- **Source:** the personal-preferences pack needed a parameter no member could derive.
- **Reason:** some packs need a value that is a fact about the fleet. Canon cannot supply it,
  because a bootstrap run does not know which fleet it is bootstrapping into; only the enforcer
  knows, because it is the fleet.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a scheduled agentless task reading this repo's `packSeeds` config and writing the
  missing declaration into each member. It names no pack itself: every id comes from the config, so
  the enforcer never becomes a second place packs are known. It seeds and never overrides, so a
  choice a member already made stands.
- **Rejected:** the first shape named the pack and carried its parameter as `preferencesRepo`, which
  made the enforcer a second place packs are known, one level out.
- **Landed:** #567.

## 2026-09-07 · policy-changed · dormancy is read off the tasks pack, not the engine (#1851)
- **Reason:** every effect dormancy has is an effect on the work-item queue, and a repo declaring no
  scheduler pack has no scheduler for the word to mean anything about.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the sweep reads the predicate the `claudinite-tasks` pack publishes through its
  shared-code surface, the one place the pack-independence barrier lets another pack import across.
- **Landed:** #1851 (Closes #1845) · pack version 60907.1.
