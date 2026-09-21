## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite. The evidence names the project for the set of rules rather than
  one per rule.
- **Reason:** a `start()` that awaits a permission check or a first fix can re-arm its streams and
  timers after `stop()` ran mid-await, and the symptom - a GPS subscription still live after
  sign-out - is invisible to any test that does not await realistically. The epoch counter is the
  only guard that survives the await.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Async lifecycle guards need an epoch counter.".
- **Landed:** #165 (Closes #180) · pack version 1.
