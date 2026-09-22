## 2026-08-12 · born · a canon pack for native macOS app development (#756)
- **Source:** missingbulb/LaughCounter, a SwiftPM menu-bar agent app published as a notarized DMG
  through GitHub Actions: its `mac/scripts/`, `mac/Resources/`, release workflow and
  `dev/procedures/mac-audio-lifecycle.md`.
- **Reason:** a fleet sweep found no canon pack homing native Mac app development; `ios`, `android`
  and `app-store-release` cover neighbouring axes and none covers a Developer-ID-signed, notarized,
  DMG-distributed Mac app.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the pack manifest, fingerprinted on a `Package.swift` at the repo root or one
  directory down (a monorepo's `mac/` dir) and never deeper, so a nested fixture package cannot trip
  detection. The marker only suspects the pack, since a Swift package can equally be a library or an
  iOS-only target, so declaring it stays the project's call.
- **Rejected:** the pack was first proposed prose-only (`worldRules: []`), on the argument that
  every grounded rule is runtime device behaviour, a CI lane's shape or a plist/entitlement judgment
  call with no false-positive-free static signature. The two conditional exit-path rules that landed
  with it refuted that for their class: where the rule is itself conditional, the condition is the
  gate.
- **Landed:** #756 (Closes #641) · pack version 1.

## 2026-08-23 · scope-changed · the tree declares the pack (#1248)
- **Reason:** every field the manifest was restating had exactly one correct value, the one its own
  directory already gave. A manifest with no `id` is dropped outright by a pre-convention engine,
  which fails the mount self-test, so `minEngineVersion` rises to the engine release that reads the
  conventions and the update flow's terminal holds the ordering.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest keeps `version`, `minEngineVersion`, `ruleRoutingGuidance`, `marker`
  and `detect`; `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the
  pack directory. The two coded checks move into `worldRules/` and the tests into `test/`, which no
  vendor set ships.
- **Landed:** #1248 (Closes #1246) · pack version 60822.1.
