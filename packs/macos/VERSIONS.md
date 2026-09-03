# Version history

Records for `packs/macos/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60820.1); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60903.1 | 2026-09-03 | The `Info.plist`/`Package.swift` keys and the TCC/entitlement rules move out of `RULES.md` into the `macos-app-bundle` and `macos-entitlements-and-tcc` skills, forced by `force-load-on-file-edits-paths` for the files they govern; the notarized-build line moves to the README (#1662). |
| 60902.1 | 2026-09-02 | The TCC usage-description rule becomes a bullet keyed to reaching for a protected resource; section preambles and the descriptive framing go, the latter to the pack README. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
