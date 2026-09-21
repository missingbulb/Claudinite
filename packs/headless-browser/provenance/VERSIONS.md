# Version history

Records for `packs/headless-browser/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 5 | 2026-08-20 | Pack reorganization: two collapses and two renames (#1081) |
| 4 | 2026-08-19 | Collapse chrome-extension-release into chrome-extension, and stop packs discussing each other (#1060) |
| 3 | 2026-08-18 | Promote 4 lessons from EdFringeNow and TLDR (#985) |
| 2 | 2026-08-18 | Index every pack's rules and checks with words, severity and reason (#915); Growth promote: 20 lessons from 8 members' local packs (#949); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-16 | Claudinite growth: mint the headless-browser canon pack (#905) |
