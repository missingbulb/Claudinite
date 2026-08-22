# Version history

Records for `packs/ios/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60820.1); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60902.2 | 2026-09-03 | `promote-to-canon` fills the stub with its first two worked-example rules: the agent's own sandbox has no macOS/Swift toolchain (often network-blocked, not merely absent), and an Apple Developer Documentation page is JS-rendered — fetch its JSON mirror instead. `README.md` is added to carry the pack description and rule index (#1204). |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
