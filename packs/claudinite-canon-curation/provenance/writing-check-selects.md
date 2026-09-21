## 2026-07-30 · born · Claudinite growth: extract lessons (#576)
- **Source:** a check that scanned a layout the corpus had abandoned, matched nothing in any tree,
  and read as live while catching nothing (#560).
- **Reason:** the dead pattern was hidden by fixtures spelling the same dead layout, so they proved
  the matching and never the selection.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a rule in the `claudinite` local pack's RULES.md. It does not reach the check rung:
  how a check's own scope is verified has no repo-state signature.
- **Landed:** #576 (Refs #571).

## 2026-08-24 · split · Cut the local pack's RULES.md to one trigger and directive per rule (#1315)
- **Reason:** the rule carried two situations, and a bundled rule cannot be trimmed without losing
  one of them. The directory-naming clause becomes a rule of its own, which a reader can arrive at
  without this one.
- **Actor:** @missingbulb (owner).
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
