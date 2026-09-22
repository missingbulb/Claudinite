## 2026-08-16 · born · Rephrase the local pack's rules: trigger-keyed, and a third the words (#890)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a rule in the `claudinite` local pack's RULES.md. This is the earliest commit whose
  diff carries the rule's text; the rephrase it landed in rewrote every rule in that file, so what
  the rule read as before it the evidence here does not reach.
- **Landed:** #890 (Closes #889).

## 2026-08-27 · strengthened · tidy-repo: an improve-comments task and skill (#1384)
- **Source:** a pack whose RULES.md described what its own workers do, each of which already states
  its policy in the `task.md` it loads.
- **Reason:** the rule named only a paragraph explaining how a mechanism works, and that shape got
  past it; widened to anything that describes rather than instructs. A survey of the other packs
  found no second case.
- **Actor:** @missingbulb (owner).
- **Landed:** #1384 (Closes #1383).

## 2026-09-04 · moved · claudinite-canon-curation owns the shelf (#1674)
- **Reason:** the `claudinite` local pack keeps what is Claudinite's own - its scope, standing
  decisions, the engine, the mount and the queue - and everything about the packs on a canon's shelf
  belongs to the pack that curates it. Both manifests' routing guidance says the boundary.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the rule moves from the `claudinite` local pack's RULES.md into this pack's first
  RULES.md.
- **Landed:** #1674 (Closes #1673) · pack version 60904.1.
