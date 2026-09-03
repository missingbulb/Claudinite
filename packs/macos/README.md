# macos

Native macOS app development: assembling the app bundle, the TCC / Hardened Runtime pair, the
Developer ID → notarization → DMG lane, and the process-lifecycle facts a Mac app cannot get wrong.

Sibling packs on the same axis: `ios` (iPhone targets), `app-store-release` (the Mac/iOS App Store
lane, which this pack's Developer ID track deliberately is not), `git-github` (workflow YAML
mechanics for the CI that runs the lane).

## Rules (`RULES.md`)

Two rules, for every session that ships anything a user runs:

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Diagnostics belong inside the shipped app | medium | complexity | prose: 33 words |
| command -v swift doesn't test the toolchain | medium | correctness | prose: 62 words |

Everything else is a skill, loaded by the activity it names: the bundle and the TCC/entitlement
pair are forced by the guard for the files they govern (`Info.plist`, `Package.swift`,
`*.entitlements`); speech, signing and release, exit paths, sleep/wake and the audio-device
lifecycle trigger on their description. A notarized build should need no Gatekeeper bypass at
all — a README whose manual-bypass section is the one users actually follow is the sign the
signing lane isn't running.

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `sudden-termination-vs-teardown` | high | correctness | check: blocking |
| `signal-teardown-routing` | high | correctness | check: blocking |
| `minimum-system-version-agrees` | high | correctness | check: blocking |

Three checks, each on a rule whose static signature is false-positive-free *because the rule is
itself conditional*: each fires only where the tree already shows the posture the rule is about —
terminate-time teardown, an AppKit app that installs a capture tap, or a plist and a package
manifest that both state an OS floor. The rest stays prose, in the skills: runtime device behaviour, a CI
lane's shape, or a plist/entitlement judgment call, none of which a scan can tell apart from a
healthy repo. The `Package.swift` fingerprint only **suspects** the pack — a Swift package can be a
library or an iOS-only target, so declaration stays the project's call.

## Skills

| Skill | Trigger |
|---|---|
| [`macos-app-bundle`](skills/macos-app-bundle/SKILL.md) | any edit of `**/Info.plist` or `**/Package.swift` — held by the guard until loaded |
| [`macos-entitlements-and-tcc`](skills/macos-entitlements-and-tcc/SKILL.md) | any edit of `**/*.entitlements` or `**/Info.plist` — held by the guard until loaded |
| [`macos-speech-recognition`](skills/macos-speech-recognition/SKILL.md) | adding or changing an `SFSpeech*` call site |
| [`macos-signing-and-release`](skills/macos-signing-and-release/SKILL.md) | signing or distributing a build, writing the release workflow or the install doc |
| [`macos-exit-paths`](skills/macos-exit-paths/SKILL.md) | writing terminate-time teardown, an `AppDelegate`, or signal handling |
| [`macos-sleep-and-wake`](skills/macos-sleep-and-wake/SKILL.md) | writing `NSWorkspace` wake handling, deferred work, or anything timed across a sleep |
| [`macos-audio-device-lifecycle`](skills/macos-audio-device-lifecycle/SKILL.md) | writing or changing audio capture, device-presence or engine start/stop code |

**Provenance.** Distilled from `missingbulb/LaughCounter` — a SwiftPM menu-bar agent app published
as a notarized DMG through GitHub Actions, whose `mac/scripts/`, `mac/Resources/`, release workflow
and `dev/procedures/mac-audio-lifecycle.md` are the evidence behind every rule and skill above. The
device-lifecycle detail, the two checks and the on-device-speech section come from that project's
own local packs (`macos-audio`, `on-device-privacy`), which held them as portable macOS knowledge
before this pack existed; what stays local there is what is genuinely about *that app* — which of
its types owns the engine, where its files live, and its no-egress product promise.
