## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite. The evidence names the project for the set of rules rather than
  one per rule.
- **Reason:** the analyzer will not stop a convenient import leak, so the ports boundary needs an
  assertion of its own or it decays. It stays prose rather than a canon check because the forbidden
  prefixes are the consuming project's list, unbounded from here.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Enforce the boundary with a committed import-scan
  test".
- **Landed:** #165 (Closes #180) · pack version 1.
