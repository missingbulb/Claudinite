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
| Secret-gated signing lane | prose |
| DMG and Gatekeeper | prose |
| No toolchain assumed | prose |
| Exit paths | prose |
| Sleep and deferred work | prose |
| Holding a device | prose |

No conformance checks: every rule is runtime device behaviour, a CI lane's shape, or a
plist/entitlement judgment call whose grounded cases have no false-positive-free static signature.
The `Package.swift` fingerprint only **suspects** the pack — a Swift package can be a library or an
iOS-only target, so declaration stays the project's call.

**Provenance.** Distilled from `missingbulb/LaughCounter` — a SwiftPM menu-bar agent app published
as a notarized DMG through GitHub Actions, whose `mac/scripts/`, `mac/Resources/`, release workflow
and `dev/procedures/mac-audio-lifecycle.md` are the evidence behind every rule above.
