# Version history

Records for `packs/flutter/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60903.1 | 2026-09-03 | The golden mechanics become the `flutter-golden-tests` skill (forced for test files) and the `pubspec.lock` skew rule `flutter-pubspec` (forced for `pubspec.yaml`/`pubspec.lock`); the web-sandbox SDK note moves to the README (#1662). |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 2 | 2026-08-18 | Index every pack's rules and checks with words, severity and reason (#915); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128); Add executable-requirements pack; fill the flutter pack stub (#165); flutter/node pack detect: match monorepo subdir markers (#185); Pack environment requirements: corpus-owned generic script, packs declare the rest (#204); No pack is active by default — the basics pack (né universal) is declared explicitly (#232); Vendored-mount surface shrink: engine/ consolidation, skills into packs, no CI stub, minimal CLAUDE.md + .gitignore (#384); Tighten every RULES.md to when + what + one non-obvious fact (#467); Growth: promote 5 lessons from the fleet's local packs (#497); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); Versioned updates Phase 0: version scaffolding (#769) |
