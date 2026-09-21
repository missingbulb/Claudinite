## 2026-08-24 · born · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a rule in the `claudinite` local pack's RULES.md, split out of the path-pattern
  scope rule it had been a trailing clause of.
- **Landed:** #1315 (Closes #1312).

## 2026-09-04 · moved · claudinite-canon-curation owns the shelf (#1674)
- **Reason:** the `claudinite` local pack keeps what is Claudinite's own - its scope, standing
  decisions, the engine, the mount and the queue - and everything about the packs on a canon's shelf
  belongs to the pack that curates it. Both manifests' routing guidance says the boundary.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the rule moves from the `claudinite` local pack's RULES.md into this pack's first
  RULES.md.
- **Landed:** #1674 (Closes #1673) · pack version 60904.1.
