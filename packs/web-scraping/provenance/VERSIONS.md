# Version history

Records for the `version` field of `packs/web-scraping/`'s manifest, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60928.1 | 2026-09-28 | Pack manifests become pack.json (#2382) |
| 60927.1 | 2026-09-27 | Give every offered pack a pitch (#2369) |
| 60925.2 | 2026-09-25 | Cut skill descriptions out of session-start context (#2325) |
| 60925.1 | 2026-09-25 | Rename a check's severity to on_fail: block \| advise; retire the baseline/converge vocabulary (#2318) |
| 60922.1 | 2026-09-22 | Usage review: skills declare their expected usage, rules read it back (#2214) |
| 60921.1 | 2026-09-21 | Provenance: backfill web-scraping (#2205) |
| 60920.1 | 2026-09-20 | Provenance: the marking pass, every rule marked and every references.md converted (#2178) |
| 60918.1 | 2026-09-18 | Split the website packs by ownership: public-website, github-pages, cloudflare-site (#2101) |
| 60913.1 | 2026-09-13 | Claudinite: pack version history (#1730); State a rule's prose size as a band, not an exact word count (#2009) |
| 60903.2 | 2026-09-03 | The cache-vs-raw-record rationale moves from `RULES.md` to the README; the rule keeps its directive (#1662). |
| 60903.1 | 2026-09-03 | A skill's `SKILL.md` opens on what to do, not on what the skill is: the self-describing framing and the pointers to prose the reader already holds are gone. |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries - the file carries rules only. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 4 | 2026-08-20 | Pack reorganization: two collapses and two renames (#1081) |
| 3 | 2026-08-19 | Collapse chrome-extension-release into chrome-extension, and stop packs discussing each other (#1060) |
| 2 | 2026-08-18 | Index every pack's rules and checks with words, severity and reason (#915); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | Claudinite growth: discover canon pack web-scraping (#739) |
