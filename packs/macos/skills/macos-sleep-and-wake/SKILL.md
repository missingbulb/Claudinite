---
name: macos-sleep-and-wake
description: Handling sleep and wake in a macOS app — fanning in and coalescing the return signals, generation-counted deferred work, and which clock measures a span across a sleep. Use when writing NSWorkspace wake handling, deferred (asyncAfter) work, or anything timed across sleep.
---

# Sleep, wake, and deferred work

- **There is no "the machine is back" notification.** `NSWorkspace.didWakeNotification` also fires
  for a dark/Power-Nap wake with nobody there. Fan in the several signals that a real return emits
  (wake, screens wake, session became active, the screen-unlocked distributed notification) and
  **coalesce them** — a genuine return fires a burst, and each must not schedule its own work.

- **Coalesce with an id, not a boolean.** A single `pending` flag deadlocks: something invalidates
  the timer, the timer clears the flag, and whichever ordering loses leaves the next wake either
  unable to schedule or double-scheduling. Hold the in-flight work's id; a stale timer compares its
  captured id and returns.

- **`asyncAfter` work scheduled before sleep fires immediately on wake.** Give every intentional
  stop a generation counter, capture the generation when scheduling, and abort in the closure if it
  moved — otherwise deferred work reacquires resources on the way *into* sleep or before the
  machine has settled. When cancelling in-flight work, reset the latches beside it too, or they
  stay stuck and block everything after.

- **Measure a span that includes a sleep with `Date()`, not `ProcessInfo.systemUptime`.** The
  monotonic clock does not advance while the machine sleeps — which is exactly the span you are
  trying to measure. Use `systemUptime` for the opposite question ("how long, while we were
  awake").
