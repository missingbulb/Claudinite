# Version history

Records for `packs/claudinite-canary-repo/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60831.1 | 2026-08-31 | The manifest and README say the withhold lane this pack probes is LIVE again, where they said it was retired and the probe exercised a route that no longer existed. Reopened in #1509; this pack is once more the thing that makes the record's `materialize` runnable against a real member (#1539). |
| 60824.2 | 2026-08-24 | A README link followed the task surface out of `engine/scheduler/` (#1328). |
| 60824.1 | 2026-08-24 | The withhold lane this pack probes is retired, so the probe exercises a delivery route that no longer exists; the manifest says so where an adopter reads it (#1317). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60821.2 | 2026-08-21 | This pack's inline version-history comment moved out of `pack.mjs` into this file. |
| 60821.1 | 2026-08-21 | Hidden packs: withhold claudinite-canary-repo from the pack directory (#1164) |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 4 | — | Renamed from `canary-probe` — the pack's subject is a Claudinite feature, so it carries the prefix that says so. |
