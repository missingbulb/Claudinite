## 2026-09-06 · born · a version log's rows run newest-first, held by a check (#1543)
- **Source:** #1542: the claudinite-tasks pack's log descended from 60831.9 to 60824.1 and then
  trailed four rows out of order, because nothing stated or held the convention and a writing
  session appended wherever it landed.
- **Reason:** a reader trusts a row's position to say its age; once the tail drifts, a number near
  the bottom could be old or merely misplaced and only re-deriving the order from the numbers can
  tell.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a world-scope coded check, blocking, over every shelf pack's version log: ordering
  is a property of the whole file, which a diff-scoped check appending one row in the right place
  cannot see. Reuses the record's own row parser.
- **Retire when:** the log's writer is the only thing that ever writes a row, so no hand-placed row
  can land.
- **Landed:** #1543 (Refs #1542) · pack version 60906.5.

## 2026-09-21 · severity-changed · reads the log at its new place, under each pack's `provenance/`
- **Source:** the move of every pack's version log under `provenance/`, the owner's call on #2190's
  review.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the scope is `packs/<id>/provenance/VERSIONS.md`, matched by path segments so a
  skill's folder of that name is never read.
