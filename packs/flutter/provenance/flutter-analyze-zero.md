## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite. The evidence names the project for the set of rules rather than
  one per rule.
- **Reason:** infos included, or the bar drifts and the signal stops being read. A lint that fights
  a deliberate convention is disabled narrowly in the package that holds the convention, with the
  reason at the site, rather than by lowering the bar for everything.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "flutter analyze at zero issues".
- **Landed:** #165 (Closes #180) · pack version 1.
