## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite. The evidence names the project for the set of rules rather than
  one per rule.
- **Reason:** the widget-test binding blocks real HTTP with a 400-returning stub client, so a
  `NetworkImage` or a network `TileProvider` in the tree renders error boxes and every golden over
  it pictures a failure. The rule carries the substitute as well as the ban - a canvas-drawn
  `ImageProvider` needs no asset files - because a ban with no remedy gets worked around.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Anything that fetches must be injectable".
- **Landed:** #165 (Closes #180) · pack version 1.
