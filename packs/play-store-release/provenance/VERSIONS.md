# Version history

Records for the `version` field of `packs/play-store-release/`'s manifest, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60928.1 | 2026-09-28 | Pack manifests become pack.json (#2382) |
| 60927.1 | 2026-09-27 | Give every offered pack a pitch (#2369) |
| 60925.1 | 2026-09-25 | Rename a check's severity to on_fail: block \| advise; retire the baseline/converge vocabulary (#2318) |
| 60921.1 | 2026-09-21 | Provenance: backfill android, app-store-release, play-store-release, html, claudinite-canary-repo (#2213) |
| 60920.1 | 2026-09-20 | Claudinite: pack version history (#1730) |
| 60903.1 | 2026-09-03 | The stub note moves to the pack README and `RULES.md` is gone: an absent prose file contributes nothing, where the note cost every session four lines (#1662). |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 3 | 2026-08-20 | Pack reorganization: two collapses and two renames (#1081) |
| 2 | 2026-08-19 | Collapse chrome-extension-release into chrome-extension, and stop packs discussing each other (#1060) |
| 1 | 2026-08-12 | Add executable-requirements pack; fill the flutter pack stub (#165); No pack is active by default — the basics pack (né universal) is declared explicitly (#232); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); Versioned updates Phase 0: version scaffolding (#769) |
