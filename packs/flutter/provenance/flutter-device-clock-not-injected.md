## 2026-09-20 · born · converted from references.md (check:flutter/device-clock-not-injected)
- **Reason:** A `DateTime.now()` in shipped Dart is a read no test can pin: a relative-time widget
  cannot be asserted and its golden changes with the wall clock. It replaced the "Inject the clock"
  prose rule outright — the surviving architecture rule already names the clock as one of the
  concerns that enters the UI as a port, so the check plus its fix line carries everything the
  deleted bullet said. The class that implements the port is exempt (it is the one place the read
  belongs), as is `lib/testing/`, which pins its own clock for the fakes.
- **Mechanism:** a check
- **Retire when:** Retire it if Dart's own test binding gains a way to pin the process clock.
