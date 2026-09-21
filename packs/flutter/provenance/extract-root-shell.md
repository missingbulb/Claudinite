## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite. The evidence names the project for the set of rules rather than
  one per rule.
- **Reason:** a test that rebuilds its own MaterialApp asserts against a shell the app does not
  ship, so the actuals come from somewhere the user never sees. One widget taking the ports as
  parameters is what lets `main.dart` and the harness use the same thing.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Extract the root shell into a widget".
- **Landed:** #165 (Closes #180) · pack version 1.
