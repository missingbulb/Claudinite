# macos

Native macOS app development: assembling the app bundle, the TCC / Hardened Runtime pair, the
Developer ID → notarization → DMG lane, and the process-lifecycle facts a Mac app cannot get wrong.

Sibling packs on the same axis: `ios` (iPhone targets), `app-store-release` (the Mac/iOS App Store
lane, which this pack's Developer ID track deliberately is not), `github-actions` (workflow YAML
mechanics for the CI that runs the lane).

| Section | How enforced |
|---|---|
| Bundle is assembled | prose |
| TCC vs entitlement | prose |
| On-device speech | prose |
| Secret-gated signing lane | prose |
| DMG and Gatekeeper | prose |
| No toolchain assumed | prose |
| Exit paths | prose + `sudden-termination-vs-teardown`, `signal-teardown-routing` |
| Sleep and deferred work | prose |
| Holding a device | prose |

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
