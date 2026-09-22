## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite. The evidence names the project for the set of rules rather than
  one per rule.
- **Reason:** the major Flutter plugins break their APIs often enough that a remembered signature is
  usually a stale one, and the resolved version is sitting in the pub cache to be read. The rule
  names the cache path because that is the part a session does not otherwise reach for.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Verify plugin APIs against the installed source, not
  memory.".
- **Landed:** #165 (Closes #180) · pack version 1.
