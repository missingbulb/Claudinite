## 2026-08-09 · born · Claudinite growth: extract lessons (#720)
- **Source:** an owner correction asking for the appropriate casing for pack names, after a pack
  shipped in the wrong one and cost a whole-pack rename a commit later.
- **Reason:** the convention held across every pack in the tree and nothing in the corpus stated it.
  The same correction carried a second half worth keeping: name a pack from the surface it serves,
  not the first feature you are building for it.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a rule in the `claudinite` local pack's RULES.md, marked convertible - a check over
  pack directory names carries the casing half, which a growth-extract run may not land because
  registering a rule moves the canon catalog.
- **Landed:** #720 (Refs #711).

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
- **Reason:** the kebab-case half became a check, so the rule keeps only what a check cannot judge -
  naming a pack for the surface it serves.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1779 (Closes #1760, Refs #1672) · pack version 60906.1.
