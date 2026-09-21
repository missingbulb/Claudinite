## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite. The evidence names the project for the set of rules rather than
  one per rule.
- **Reason:** `flutter test` can hang for minutes at teardown on a GPU-less container with dropped
  sockets, which reads as a broken suite rather than a broken runner. Killing the process group on
  the definitive marker is the pattern that held, and the rule keeps the wrapper thin because plain
  `flutter test` is equivalent on a healthy machine.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Sandboxed/CI runners".
- **Landed:** #165 (Closes #180) · pack version 1.
