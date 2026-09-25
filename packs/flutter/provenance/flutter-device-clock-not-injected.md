## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite.
- **Reason:** a `DateTime.now()` in shipped Dart is a read no test can pin: a relative-time widget
  cannot be asserted and its golden changes with the wall clock.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Inject the clock".
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-09-20 · converted · the clock rule becomes a declared check and its prose bullet is retired (#2164)
- **Reason:** the rule is a pattern over the shipped Dart tree and nothing else, and the
  architecture rule above it already names the clock as a port, so the check and its fix line carry
  everything the bullet said. The class implementing the port is exempt, as is `lib/testing/`, which
  pins its own clock for the fakes.
- **Actor:** @missingbulb (owner), on the canon-prose-to-checks task.
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** check flutter/device-clock-not-injected, in the pack's `declared-checks.json`.
- **Retire when:** Dart's own test binding gains a way to pin the process clock.
- **Landed:** #2164 (work item #2142) · pack version 60920.1.
