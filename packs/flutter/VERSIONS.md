# Version history

Records for `packs/flutter/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60820.1); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60903.1 | 2026-09-03 | `RULES.md` shrinks to the always-on rules; the golden mechanics become the `flutter-golden-tests` skill (forced for test files), the `pubspec.lock` skew rule `flutter-pubspec` (forced for `pubspec.yaml`/`pubspec.lock`), and the port-boundary test, fakes and root shell `flutter-port-architecture` (forced for `lib/testing/`, `lib/app.dart`, `lib/main.dart`); the web-sandbox SDK note moves to the README (#1662). |
