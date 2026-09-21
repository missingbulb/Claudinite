## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite. The evidence names the project for the set of rules rather than
  one per rule.
- **Reason:** a plugin type reaching a screen - a geolocator `Position`, a
  `FirebaseFunctionsException` - couples every widget test to the plugin's platform channels
  silently, and nothing in the toolchain reports it. Naming the ports boundary as the pack's first
  architecture rule is what the rest of the pack rests on: the fakes, the shared shell and the
  import scan all assume it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Widgets depend on ports, never on plugins".
- **Landed:** #165 (Closes #180) · pack version 1.
