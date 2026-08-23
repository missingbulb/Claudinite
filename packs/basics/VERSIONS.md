# Version history

Records for `packs/basics/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60821.4); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60823.2 | 2026-08-23 | `rule-revalidation`: `ToolSearch`'s harness-tool-contracts rule now matches current behavior — a bare short tool name (`get_me`, `sub_issue_write`, `CronCreate`) resolves through keyword search as reliably as the fully-qualified `select:` form; probed live against the deferred-tool listing, three tools for three (#1275). |
| 60823.1 | 2026-08-23 | Prose and skills name the member settings file by its current name, `.claudinite-settings.json` (#1252). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
