---
name: macos-audio-device-lifecycle
description: Holding a CoreAudio input device the user can unplug — releasing it on every exit, probing presence through the HAL rather than an engine, judging usability at both layers, and verifying on a real Mac. Use when writing or changing audio capture, device-presence or engine start/stop code.
---

# Holding a device the user can unplug

- **Release the device on every path where capture ends.** A process that dies with its IO proc
  still registered can leave some USB devices wedged until physically re-plugged. This is necessary
  and *not sufficient* — a device can also wedge below the user-space audio daemon, where no
  teardown of yours helps.

- **Never construct a capture engine to ask whether a device exists.** Materializing an input node
  opens the default device and mints a hidden per-client aggregate device; a retry ladder built on
  that is not a cheap probe but an open/close plus an aggregate create-and-destroy, repeated for as
  long as the hardware is missing. Query the HAL's device properties instead — a property read
  opens nothing and can be sampled forever for free. The churn is observable rather than
  theoretical: each hidden aggregate appears in the HAL as `CADefaultDeviceAggregate-<pid>-<n>`, so
  what a retry ladder is really doing can be counted instead of argued about.

- **Presence is not usability, at either layer.** Mid-teardown a device enumerates as alive with an
  unreadable name and a **zero** sample rate. Require a nonzero rate and a sane channel count, and
  judge the *system default* input — a healthy device behind a broken default is not one you can
  capture from. One layer up, the engine lies in the opposite direction: with the input torn down,
  the input node's `outputFormat(forBus: 0)` still reports a plausible 48 kHz while its
  `inputFormat` reports 0, so a guard written against the wrong one waves through starts that
  cannot succeed — read both and require them to agree. Whatever a new probe reads, ask what that
  field says while the device is absent.

- **A duration is a claim about a span you observed.** "It has been present for N seconds" is only
  as good as the observation behind it: a state maintained by a timer must be **seeded at start**
  (a repeating timer does not fire immediately) and **invalidated across any gap** — a sleep is a
  gap, and carrying a settle clock straight through one makes the gate inert on exactly the
  transition it was built for. Model "not observed" as its own state, distinct from "absent", and
  key the span on the device's **UID** — an unplug-and-replug, or a swap for a different mic, is a
  new arrival that starts its own clock rather than inheriting the departed device's.

- **"Started" is not "working".** A running engine delivering buffers of pure silence looks
  identical to a healthy one from the inside. Measure what actually arrives, publish a health state
  the UI renders, and when a failure mode has exactly one remedy, name **that** remedy rather than
  the generic one.

- **Compile-green is not a gate for device code.** `swift build` cannot see a raise-vs-throw bug or
  a lifecycle race, and both are reachable in the first second of a run. A change here is not
  verified until the app has actually launched on a Mac. Reaching the interesting case needs no
  hardware theatre: let the display sleep and `coreaudiod` tears its device contexts down seconds
  later, which is the same transition as an unplug from the app's point of view.
