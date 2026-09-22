## 2026-07-28 · born · Growth: promote 5 lessons from the fleet's local packs (#497)
- **Source:** the VascularColoring project's local pack, read by the 2026-07-27 growth-promote run.
- **Reason:** a mark in the signal's own colour disappears exactly on the objects it exists to mark,
  so the figure looks cleanest where the method is least verified.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Never draw an annotation in a colour the underlying
  signal itself carries.".
- **Rejected:** a check - the grounded case is checkable, but only against a project's own render
  script, and the generalized palette rule has no target to scan. It stays a local check in the
  member it came from.
- **Landed:** #497 (Refs #99) · pack version 1.
