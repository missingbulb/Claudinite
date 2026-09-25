## 2026-08-18 · born · Shim the engine paths fielded pack copies still import (#1006)
- **Source:** a forced converge that went green while the stamp did not move, the mount's self-test
  refusing a tree whose new engine sat beside an old pack.
- **Reason:** it is worse than a broken task - the converge refuses to land at all, so the member
  cannot receive the pack version that would have fixed it, and self-healing is exactly what it
  takes away.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a rule in the `claudinite` local pack's RULES.md, beside the `updates/*` rule it
  generalizes.
- **Landed:** #1006 (Closes #1004).

## 2026-09-04 · moved · claudinite-canon-curation owns the shelf (#1674)
- **Reason:** the `claudinite` local pack keeps what is Claudinite's own - its scope, standing
  decisions, the engine, the mount and the queue - and everything about the packs on a canon's shelf
  belongs to the pack that curates it. Both manifests' routing guidance says the boundary.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the rule moves from the `claudinite` local pack's RULES.md into this pack's first
  RULES.md.
- **Landed:** #1674 (Closes #1673) · pack version 60904.1.

## 2026-09-25 · reworded · "converge" in the nightly-update sense reads "update"
- **Reason:** owner decision: the mechanism that re-vendors a mount is called update; "converge"
  stays only for a work item reaching its end state.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
