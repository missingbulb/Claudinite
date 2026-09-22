## 2026-08-01 · born · Claudinite growth: extract lessons (#618)
- **Source:** a pull request whose suite ran once against its own base and merged twelve hours
  later, by which time another change had moved the whole-tree tally; `main` went red and stayed red
  for every pull request after it.
- **Reason:** a guard whose input is the whole tree does not conflict, so both branches are green
  against their own base, merge cleanly, and `main` lands red with neither having done anything
  wrong.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a rule in the `claudinite` local pack's RULES.md. No repo-side check can judge
  whether a branch's green predates `main` moving, so the ladder lands it at prose.
- **Landed:** #618 (Refs #613).

## 2026-09-04 · moved · claudinite-canon-curation owns the shelf (#1674)
- **Reason:** the `claudinite` local pack keeps what is Claudinite's own - its scope, standing
  decisions, the engine, the mount and the queue - and everything about the packs on a canon's shelf
  belongs to the pack that curates it. Both manifests' routing guidance says the boundary.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the rule moves from the `claudinite` local pack's RULES.md into this pack's first
  RULES.md.
- **Landed:** #1674 (Closes #1673) · pack version 60904.1.
