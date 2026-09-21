# Version history

Records for `packs/jwt/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60901.1 | 2026-09-01 | `jwt-advisory-watch` is retired: keeping a technology's guidance current is the canon's curation duty, not a pack task's. The README's new `## Upstream` section declares where JWT practice publishes changes and what the pack's content has been reconciled against; the canon's `upstream-watch` reads it. Nothing here scans a member's dependency manifests any more. |
| 60823.1 | 2026-08-23 | `jwt-advisory-watch` drops its standing tracker: a clean run writes nothing, and a run that finds an advisory affecting a resolved version files a real, open issue, deduped on the GHSA against the library. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 5 | 2026-08-20 | task.md describes only its own task; .claudinite/-only commits stop counting as project work (#1110) |
| 4 | 2026-08-19 | Collapse chrome-extension-release into chrome-extension, and stop packs discussing each other (#1060) |
| 3 | 2026-08-18 | Retire the slot scheduler: delete run.mjs, the slot half of slots.mjs, the slot stub and FORCE_TASKS (#993) |
| 2 | 2026-08-18 | Declarative checks: review document + the implementation it recommends (#839); Index every pack's rules and checks with words, severity and reason (#915); Tracker docs: a tracker is created in two calls, not with `state: closed` (#953); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | Add the jwt pack — JWT minting/validation distilled from The JWT Handbook (#705); Versioned updates Phase 0: version scaffolding (#769) |
