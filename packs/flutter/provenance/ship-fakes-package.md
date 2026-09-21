## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite. The evidence names the project for the set of rules rather than
  one per rule.
- **Reason:** the app's own tests and a sibling requirements suite both need the fake world, and two
  parallel ones drift apart. Shipping them in the package with a pinned clock and the real shell
  keeps one definition, and having the fakes record what the UI asked of them is what makes an
  interaction assertable at all.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Ship the fakes in the package".
- **Landed:** #165 (Closes #180) · pack version 1.
