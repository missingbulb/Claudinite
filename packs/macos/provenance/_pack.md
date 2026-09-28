## 2026-08-12 · born · a canon pack for native macOS app development (#756)
- **Source:** missingbulb/LaughCounter, a SwiftPM menu-bar agent app published as a notarized DMG
  through GitHub Actions: its `mac/scripts/`, `mac/Resources/`, release workflow and
  `dev/procedures/mac-audio-lifecycle.md`.
- **Reason:** a fleet sweep found no canon pack homing native Mac app development; `ios`, `android`
  and `app-store-release` cover neighbouring axes and none covers a Developer-ID-signed, notarized,
  DMG-distributed Mac app.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
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
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the manifest keeps `version`, `minEngineVersion`, `ruleRoutingGuidance`, `marker`
  and `detect`; `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the
  pack directory. The two coded checks move into `worldRules/` and the tests into `test/`, which no
  vendor set ships.
- **Landed:** #1248 (Closes #1246) · pack version 60822.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

## 2026-09-27 · born · a pitch paragraph for the dashboard's plain-repo view
- **Reason:** the dashboard shows a repo that does not run Claudinite the packs that fit it, and the
  owner asked for one paragraph per pack naming its main skills and process gains, with rough counts
  so it outlives the pack's growth.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `pitch` field, beside `ruleRoutingGuidance`.

## 2026-09-27 · scope-changed · the fingerprint is a `relevanceDetector` spec, not a function
- **Reason:** the owner asked for fingerprints a reader holding only GitHub's API can judge cheaply
  - a tree listing, a code search, then only the files that search names - which a function over a
  synchronous `read` cannot offer.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `relevanceDetector` (engine/pack_loader/relevance-detector.mjs): `paths`, optional `text`,
  `search` terms; it answers exactly what the retired `detect` answered, proven over 4,000 composed
  repos before the change.

## 2026-09-28 · reworded · the fingerprint's patterns are written as source strings
- **Reason:** a manifest that is data cannot hold a RegExp; each pattern is its source string, or {
  source, flags } where it carries a flag, and loads to the same RegExp.
- **Actor:** @missingbulb (owner), asking for pack.json manifests.
