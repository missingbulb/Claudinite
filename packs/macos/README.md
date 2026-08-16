# macos

Native macOS app development: assembling the app bundle, the TCC / Hardened Runtime pair, the
Developer ID → notarization → DMG lane, and the process-lifecycle facts a Mac app cannot get wrong.

Sibling packs on the same axis: `ios` (iPhone targets), `app-store-release` (the Mac/iOS App Store
lane, which this pack's Developer ID track deliberately is not), `github-actions` (workflow YAML
mechanics for the CI that runs the lane).

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| SwiftPM builds a binary; nothing builds you a .app. | 49 | high | correctness | prose |
| Commit one high-resolution icon master and generate the .icns | 44 | low | complexity | prose |
| A menu-bar-only app is LSUIElement: true | 23 | medium | correctness | prose |
| Pin LSMinimumSystemVersion to the same OS version the package's platforms: declares. | 30 | high | correctness | prose |
| Notarization requires the Hardened Runtime | 64 | critical | legal | prose |
| Capabilities gated purely by TCC plus their usage string need no entitlement at all | 41 | medium | correctness | prose |
| Do not enable the App Sandbox on the Developer ID track. | 40 | high | correctness | prose |
| SFSpeechRecognizer streams audio to Apple's servers by default. | 70 | critical | legal | prose |
| The opt-in is only honourable where the locale's model is installed. | 74 | high | correctness | prose |
| The unsigned path must stay a working path. | 57 | medium | complexity | prose |
| An ad-hoc signature cannot be notarized. | 40 | high | legal | prose |
| Notarize the distributed container, then staple it | 41 | high | legal | prose |
| In CI, an imported identity must be in the searchable keychain list. | 53 | medium | correctness | prose |
| Say out loud, in a build annotation, which lane ran. | 27 | medium | complexity | prose |
| A drag-to-install DMG is a staged folder, not Finder scripting. | 55 | medium | complexity | prose |
| Write the Gatekeeper bypass for the OS your users are on. | 51 | medium | correctness | prose |
| A notarized build should need none of that | 26 | low | complexity | prose |
| Diagnostics belong inside the shipped app | 33 | medium | complexity | prose |
| command -v swift does not test for a Swift toolchain. | 62 | medium | correctness | prose |
| NSApplication installs no signal handlers. | 75 | high | correctness | prose + check (`signal-teardown-routing`) |
| An uncaught Objective-C exception is an exit path too. | 63 | high | correctness | prose |
| There is no "the machine is back" notification. | 57 | high | correctness | prose |
| Coalesce with an id, not a boolean. | 50 | high | correctness | prose |
| asyncAfter work scheduled before sleep fires immediately on wake. | 65 | high | correctness | prose |
| Measure a span that includes a sleep with Date(), not ProcessInfo.systemUptime. | 45 | high | correctness | prose |
| Release the device on every path where capture ends. | 52 | critical | correctness | prose |
| Never construct a capture engine to ask whether a device exists. | 104 | high | correctness | prose |
| Presence is not usability, at either layer. | 121 | high | correctness | prose |
| A duration is a claim about a span you observed. | 119 | high | correctness | prose |
| "Started" is not "working". | 50 | high | correctness | prose |
| Compile-green is not a gate for device code. | 81 | high | correctness | prose |

## Checks

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `sudden-termination-vs-teardown` | blocking | high | correctness | an app with terminate-time teardown must not declare `NSSupportsSuddenTermination` — macOS may SIGKILL it and skip the teardown |
| `signal-teardown-routing` | blocking | high | correctness | an AppKit app that installs a capture tap routes SIGINT/SIGTERM through its own teardown instead of the fatal default |

Two checks, both on the exit paths — the rules whose static signature is false-positive-free
*because the rule is itself conditional*: each fires only where the tree shows the posture the rule
is about (terminate-time teardown; an AppKit app that installs a capture tap). The rest stays prose:
runtime device behaviour, a CI lane's shape, or a plist/entitlement judgment call, none of which a
scan can tell apart from a healthy repo. The `Package.swift` fingerprint only **suspects** the
pack — a Swift package can be a library or an iOS-only target, so declaration stays the project's
call.

**Provenance.** Distilled from `missingbulb/LaughCounter` — a SwiftPM menu-bar agent app published
as a notarized DMG through GitHub Actions, whose `mac/scripts/`, `mac/Resources/`, release workflow
and `dev/procedures/mac-audio-lifecycle.md` are the evidence behind every rule above. The
device-lifecycle detail, the two checks and the on-device-speech section come from that project's
own local packs (`macos-audio`, `on-device-privacy`), which held them as portable macOS knowledge
before this pack existed; what stays local there is what is genuinely about *that app* — which of
its types owns the engine, where its files live, and its no-egress product promise.
