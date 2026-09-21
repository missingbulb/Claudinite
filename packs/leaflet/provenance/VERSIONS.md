# Version history

Records for `packs/leaflet/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60901.1 | 2026-09-01 | Recovers the rationale #467 cut from two rules into a new `references.md` — the mid-page scroll trap and the OSM attribution licence term. The `Grounded in <project file>` notes stay cut (#1571). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 2 | 2026-08-18 | Index every pack's rules and checks with words, severity and reason (#915); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | Add leaflet pack (distilled from EdFringeNow) (#403); Tighten every RULES.md to when + what + one non-obvious fact (#467); prose-to-checks: convert the Leaflet CDN pin + SRI rule to a check (#510); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); leaflet: convert the tile-attribution rule to a check (#607); Versioned updates Phase 0: version scaffolding (#769) |
