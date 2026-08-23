# macOS

Portable practices for a **native macOS app** — the ones that are true whatever the app does:
assembling the app bundle, the TCC and Hardened Runtime pair, the Developer ID → notarization →
DMG lane, and the process-lifecycle facts a Mac app cannot get wrong. A default to adapt, not a
contract.

Distilled from a fleet project shipping a menu-bar agent app built with SwiftPM and published as a
notarized DMG. Mac App Store submission is a different track — see `app-store-release`; an iPhone
target is `ios`.

## The app bundle is assembled, not built

- **SwiftPM builds a binary; nothing builds you a `.app`.** `swift build -c release` yields an
  executable — the bundle (`Contents/MacOS/<exe>`, `Contents/Info.plist`,
  `Contents/Resources/`) is assembled by your own script. Keep that script the single place the
  bundle's shape is defined, so the local build and CI produce byte-identical layouts.
- **Commit one high-resolution icon master and generate the `.icns`** in the build script (`sips`
  to each size into an `.iconset`, then `iconutil -c icns`). Both tools ship with macOS, so the
  repo carries one PNG instead of ten, and the icon can't half-update.
- **A menu-bar-only app is `LSUIElement: true`** in `Info.plist` — that, not code, is what removes
  the Dock icon and the main window.
- **Pin `LSMinimumSystemVersion` to the same OS version the package's `platforms:` declares.** They
  are two independent claims about the same floor, and only one of them is enforced at launch.
- **Surface the running app's version *and* build number, read live from the single manifest
  source** (`Bundle.main`/`Info.plist`), never a duplicated string constant. A release pipeline
  keyed only on the version string can silently republish the same release under a new binary (a
  merge that leaves `CFBundleShortVersionString` untouched still refreshes the artifact behind it)
  — the build number is what actually lets a support conversation tell two such builds apart.

## TCC and the Hardened Runtime are two different gates — know which applies

Every protected resource needs a **usage-description string** in `Info.plist` (the text of the
consent prompt; without it the app is killed rather than prompted) — one key per resource, and they
are separate keys for capabilities that feel like one feature: `NSMicrophoneUsageDescription` covers
audio input, `NSSpeechRecognitionUsageDescription` covers the Speech framework, and an app that
listens *and* transcribes needs both or is killed at whichever it forgot. What each string says is
what the user consents to. Only *some* resources also need a **codesign entitlement**, and only
under the Hardened Runtime:

- **Notarization requires the Hardened Runtime** (`codesign --options runtime`), and under it a
  resource-access exception must be granted explicitly by entitlement — device capture
  (`com.apple.security.device.audio-input`, camera) is the classic one. So **turning on
  notarization can silently break a capability an ad-hoc build had**, because the ad-hoc build was
  never running under the restriction. Ship the entitlement in the same change as the runtime flag.
- **Capabilities gated purely by TCC plus their usage string need no entitlement at all** (speech
  recognition is the worked example). Adding one you don't need is noise; omitting one you do need
  is a runtime failure no build step catches.
- **Do not enable the App Sandbox on the Developer ID track.** The sandbox belongs to the Mac App
  Store lane, needs a different (Apple Distribution) certificate, and silently removes
  capabilities the direct-download build has — distributed notifications, for one.

## Speech recognition leaves the machine unless you say it must not

- **`SFSpeechRecognizer` streams audio to Apple's servers by default.** On-device recognition is
  opt-in, and the opt-in is a property of the **request**
  (`request.requiresOnDeviceRecognition = true`), not of the recognizer — so it has to be set on
  every request the app builds, and a new call site added later starts out server-side. Nothing in
  the build says which mode ran; the difference is only visible in what left the machine.
- **The opt-in is only honourable where the locale's model is installed.** `supportsOnDeviceRecognition`
  is per-recognizer and false until then, and requiring on-device recognition where it isn't
  supported fails the request rather than quietly falling back — so check it and decide the degrade
  deliberately (refuse the feature, or say plainly that this locale would transcribe off-device).
- Speech is TCC-gated, so it needs its usage string and **no** entitlement — see the section above.

## Keep signing and notarization an optional, secret-gated lane

- **The unsigned path must stay a working path.** Gate the Developer ID + notarization steps on the
  signing secrets being present, and ship an **ad-hoc-signed** artifact when they aren't. Make
  signing a required step and every fork, and every build in a repo whose secrets aren't set, goes
  red for a reason unrelated to the change.
- **An ad-hoc signature cannot be notarized.** They are separate lanes, not degrees of the same
  one: only an identity-signed bundle can be submitted to the notary service. Don't write a
  pipeline that "tries" to notarize whatever it just signed.
- **Notarize the distributed container, then staple it** (`notarytool submit --wait`, then `stapler
  staple` and `stapler validate`). Stapling is what makes the download open offline without a
  round-trip to Apple; skipping it works on your machine and fails on a user's.
- **In CI, an imported identity must be in the searchable keychain list.** Creating an ephemeral
  keychain, importing the `.p12` and setting the key partition list is not enough —
  `codesign` searches the *user's keychain list*, so the new keychain has to be added to it or the
  identity is simply not found.
- **Say out loud, in a build annotation, which lane ran.** "No signing secret — publishing an
  ad-hoc build" turns a silently-degraded artifact into a visible one.

## Distribution and the Gatekeeper story you owe the user

- **A drag-to-install DMG is a staged folder, not Finder scripting.** Stage the `.app` beside a
  symlink to `/Applications`, drop the icon in as `.VolumeIcon.icns`, flag the folder as having a
  custom icon, and let `hdiutil create` carry it through. Anything that automates Finder to lay out
  the window is fragile in CI and unnecessary.
- **Write the Gatekeeper bypass for the OS your users are on.** macOS 15 removed the
  right-click → *Open* bypass; the current path is System Settings → Privacy & Security →
  *Open Anyway*, or `xattr -dr com.apple.quarantine <app>`. An install doc that still says
  right-click → Open reads as broken software.
- **A notarized build should need none of that** — if your README's manual-bypass section is the
  one users actually follow, the signing lane isn't running.

## Assume the user's Mac has no developer toolchain

The machine running a distributed app installed the artifact; it has no Xcode. Two consequences:

- **Diagnostics belong inside the shipped app**, or in a script using only what ships with macOS.
  Anything requiring a compiler on the user's machine is a diagnostic that will never be run.
- **`command -v swift` does not test for a Swift toolchain.** `/usr/bin/swift` exists on every Mac
  as a stub that pops the *"install the command line developer tools?"* dialog when invoked — so
  the probe passes and the script asks the user to install several gigabytes of Xcode. Gate on
  `xcode-select -p >/dev/null 2>&1`, which fails quietly when the tools are absent.

## Exit paths: `applicationWillTerminate` is not "every exit"

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

## Sleep, wake, and deferred work

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

## Holding a device the user can unplug

If the app captures from shared hardware (microphone, camera), these are the rules that cost the
most to learn:

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
