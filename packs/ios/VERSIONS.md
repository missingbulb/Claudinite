# Version history

Records for `packs/ios/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60820.1); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60904.1 | 2026-09-04 | First two rules fill the stub (#1671): a Swift/iOS change is verified by CI alone, and Apple Developer Documentation is fetched through its JSON mirror. |
| 60903.1 | 2026-09-03 | The stub note moves to the pack README and `RULES.md` is gone: an absent prose file contributes nothing, where the note cost every session four lines (#1662). |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
