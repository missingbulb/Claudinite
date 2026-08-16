# macos

Native macOS app development: assembling the app bundle, the TCC / Hardened Runtime pair, the
Developer ID → notarization → DMG lane, and the process-lifecycle facts a Mac app cannot get wrong.

Sibling packs on the same axis: `ios` (iPhone targets), `app-store-release` (the Mac/iOS App Store
lane, which this pack's Developer ID track deliberately is not), `github-actions` (workflow YAML
mechanics for the CI that runs the lane).

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| SwiftPM builds a binary; nothing builds you a .app. | high | correctness | prose: 49 words |
| Commit one high-resolution icon master and generate the .icns | low | complexity | prose: 44 words |
| A menu-bar-only app is LSUIElement: true | medium | correctness | prose: 23 words |
| Pin LSMinimumSystemVersion to the same OS version the package's platforms: declares. | high | correctness | prose: 30 words |
| Notarization requires the Hardened Runtime | critical | legal | prose: 64 words |
| Capabilities gated purely by TCC plus their usage string need no entitlement at all | medium | correctness | prose: 41 words |
| Do not enable the App Sandbox on the Developer ID track. | high | correctness | prose: 40 words |
| SFSpeechRecognizer streams audio to Apple's servers by default. | critical | legal | prose: 70 words |
| The opt-in is only honourable where the locale's model is installed. | high | correctness | prose: 74 words |
| The unsigned path must stay a working path. | medium | complexity | prose: 57 words |
| An ad-hoc signature cannot be notarized. | high | legal | prose: 40 words |
| Notarize the distributed container, then staple it | high | legal | prose: 41 words |
| In CI, an imported identity must be in the searchable keychain list. | medium | correctness | prose: 53 words |
| Say out loud, in a build annotation, which lane ran. | medium | complexity | prose: 27 words |
| A drag-to-install DMG is a staged folder, not Finder scripting. | medium | complexity | prose: 55 words |
| Write the Gatekeeper bypass for the OS your users are on. | medium | correctness | prose: 51 words |
| A notarized build should need none of that | low | complexity | prose: 26 words |
| Diagnostics belong inside the shipped app | medium | complexity | prose: 33 words |
| command -v swift does not test for a Swift toolchain. | medium | correctness | prose: 62 words |
| NSApplication installs no signal handlers. | high | correctness | prose: 75 words + check (`signal-teardown-routing`) |
| An uncaught Objective-C exception is an exit path too. | high | correctness | prose: 63 words |
| There is no "the machine is back" notification. | high | correctness | prose: 57 words |
| Coalesce with an id, not a boolean. | high | correctness | prose: 50 words |
| asyncAfter work scheduled before sleep fires immediately on wake. | high | correctness | prose: 65 words |
| Measure a span that includes a sleep with Date(), not ProcessInfo.systemUptime. | high | correctness | prose: 45 words |
| Release the device on every path where capture ends. | critical | correctness | prose: 52 words |
| Never construct a capture engine to ask whether a device exists. | high | correctness | prose: 104 words |
| Presence is not usability, at either layer. | high | correctness | prose: 121 words |
| A duration is a claim about a span you observed. | high | correctness | prose: 119 words |
| "Started" is not "working". | high | correctness | prose: 50 words |
| Compile-green is not a gate for device code. | high | correctness | prose: 81 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `sudden-termination-vs-teardown` | high | correctness | check: blocking |
| `signal-teardown-routing` | high | correctness | check: blocking |

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
