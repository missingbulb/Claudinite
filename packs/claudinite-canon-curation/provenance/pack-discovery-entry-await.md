## 2026-07-31 · born · Claudinite growth: extract lessons (#606)
- **Source:** a CLI entry point inside the discovery import graph that deadlocked in every repo
  under every declaration, read by its fail-soft caller as a merely-absent note.
- **Reason:** discovery imports every manifest and every skill's checks before activation is
  consulted, so a module in that graph that is also a CLI entry point is re-imported while still
  evaluating; a top-level await in its entry block never settles and Node exits 13.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a coded check, blocking, walking the static import graph from the real manifests
  with comments and string bodies blanked first. Parsed rather than grepped: a bare grep for `await`
  hits every async function, and a grep for the entry guard hits the CLI workers that legitimately
  await at top level and are not in the graph. A dynamic import is deliberately not followed, being
  what makes the cycle harmless.
- **Landed:** #606 (Refs #599).

## 2026-09-04 · moved · claudinite-canon-curation owns the shelf (#1674)
- **Reason:** the `claudinite` local pack keeps what is Claudinite's own - its scope, standing
  decisions, the engine, the mount and the queue - and everything about the packs on a canon's shelf
  belongs to the pack that curates it. Both manifests' routing guidance says the boundary.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the world rule and its test move from the `claudinite` local pack into this pack.
  The canon-home rehearsal fixture gains a CLI module inside the shelf pack's own import graph, in
  the safe form, so the rule's silence on a second canon is rehearsed rather than assumed.
- **Landed:** #1674 (Closes #1673) · pack version 60904.1.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
