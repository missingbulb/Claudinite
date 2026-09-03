---
name: macos-exit-paths
description: The exits of a macOS app that skip applicationWillTerminate — bare signals and uncaught Objective-C exceptions — and how to route or trap them so teardown still runs. Use when writing terminate-time teardown, an AppDelegate, or signal handling.
---

# Exit paths: `applicationWillTerminate` is not "every exit"

- **`NSApplication` installs no signal handlers.** `NSApp.terminate` (menu Quit, ⌘Q, the
  logout/shutdown Apple Event) runs `applicationWillTerminate`; a bare `SIGTERM` (Activity
  Monitor's Quit, `killall`), `SIGINT` or `SIGHUP` kills the process with **no** teardown. Route
  them through a `DispatchSourceSignal` into `NSApp.terminate` — and set `signal(sig, SIG_IGN)`
  **before** `resume()`, or a signal arriving in the gap still takes the fatal default.
  `SIGKILL`, Force Quit and a crash stay uncoverable; name that as residual risk rather than
  claiming coverage.

- **An uncaught Objective-C exception is an exit path too.** It aborts the process, so no teardown
  runs; a framework call that *raises* (rather than throws) is therefore a resource-release bug as
  well as a crash. Swift cannot catch `NSException` — a tiny Objective-C target of your own is the
  only trap, and it is only safe around calls that validate before mutating.
