# Version history

Records for `packs/app-store-release/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60903.1 | 2026-09-03 | The stub note moves to the pack README and `RULES.md` is gone: an absent prose file contributes nothing, where the note cost every session four lines (#1662). |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 3 | 2026-08-20 | Pack reorganization: two collapses and two renames (#1081) |
| 2 | 2026-08-19 | Collapse chrome-extension-release into chrome-extension, and stop packs discussing each other (#1060) |
| 1 | 2026-08-12 | Add executable-requirements pack; fill the flutter pack stub (#165); No pack is active by default — the basics pack (né universal) is declared explicitly (#232); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); Versioned updates Phase 0: version scaffolding (#769) |
