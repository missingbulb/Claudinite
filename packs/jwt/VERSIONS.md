# Version history

Records for `packs/jwt/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60820.1); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60901.1 | 2026-09-01 | `jwt-advisory-watch` is retired: keeping a technology's guidance current is the canon's curation duty, not a pack task's. The README's new `## Upstream` section declares where JWT practice publishes changes and what the pack's content has been reconciled against; the canon's `upstream-watch` reads it. Nothing here scans a member's dependency manifests any more. |
| 60823.1 | 2026-08-23 | `jwt-advisory-watch` drops its standing tracker: a clean run writes nothing, and a run that finds an advisory affecting a resolved version files a real, open issue, deduped on the GHSA against the library. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
