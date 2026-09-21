## 2026-08-23 · born · Claudinite growth: extract lessons (#1282)
- **Source:** a dangling cross-pack link the owner first corrected five weeks earlier, found still
  live and unaddressed in three files.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a rule in the `claudinite` local pack's RULES.md. The check it wants would have to
  be authored in the canon's barrier tree, outside a growth run's local-packs-only write scope, so
  the rule itself records the durable fix for a later canon-writing session.
- **Landed:** #1282 (Closes #1273).

## 2026-09-04 · moved · claudinite-canon-curation owns the shelf (#1674)
- **Reason:** the `claudinite` local pack keeps what is Claudinite's own - its scope, standing
  decisions, the engine, the mount and the queue - and everything about the packs on a canon's shelf
  belongs to the pack that curates it. Both manifests' routing guidance says the boundary.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the rule moves from the `claudinite` local pack's RULES.md into this pack's first
  RULES.md.
- **Landed:** #1674 (Closes #1673) · pack version 60904.1.

## 2026-09-06 · reworded · Rules to checks with the four-moment mechanisms (#1779)
- **Reason:** the home-only-path half became a check, so the rule keeps only what a check cannot
  judge.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1779 (Closes #1760, Refs #1672) · pack version 60906.1.
