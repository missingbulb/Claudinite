## 2026-08-18 · born · Shim the engine paths fielded pack copies still import (#1006)
- **Source:** the forced converge after #993 merged: the run went green, the stamp did not move, and
  `packs/core` failed to load on a missing `engine/scheduler/slots.mjs`.
- **Reason:** the engine lane and the pack lane are separate pull requests on separate cycles and
  pack delivery is version-gated per pack, so every member spends a window holding the new engine
  beside an old pack. A pack that fails to load fails the mount's self-test, so the converge refuses
  to land at all and the member cannot receive the pack version that would have fixed it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Renaming or deleting an engine/ module a packs/ file
  imports".
- **Retire when:** Retire the rule only if the engine and pack lanes deliver atomically.
- **Landed:** #1006 (Closes #1004).

## 2026-08-24 · reworded · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** this file carried 63% of the repo's session rule tokens and was growing ~900 tokens a
  day. Two passes: the per-rule incident archaeology comes out, then a rule carrying two situations
  is split before it is cut. 8,435 to 5,359 words, at a mean of 35 words a rule; reasoning
  is out and a measurement survives only where the number is the argument.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1315 (Closes #1312).
