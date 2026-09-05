# Version history

Records for `packs/static-website/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60905.1 | 2026-09-05 | Pack versions are cut on main by automation, never in the pull request (#1726) |
| 60903.3 | 2026-09-03 | The managed-stub-copies rule moves out of `RULES.md` into `static-site-releases`, forced for the `static-site-*` workflows (#1662). |
| 60903.2 | 2026-09-03 | `static-site-releases` forces itself for `.github/site.config` and the vendored `static-site-*` workflows (`force-load-on-file-edits-paths`) (#1648): the guard holds an edit there until the skill is loaded. |
| 60903.1 | 2026-09-03 | A skill's `SKILL.md` opens on what to do, not on what the skill is: the self-describing framing and the pointers to prose the reader already holds are gone. |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60823.1 | 2026-08-23 | Its release skill names the member settings file by its current name (#1252). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60821.1 | 2026-08-21 | The version bump belongs to the change, not to the release flow (#1151) |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 4 | 2026-08-20 | Pack reorganization: two collapses and two renames (#1081) |
| 3 | 2026-08-19 | Give every pack file one of the four sanctioned shapes (#1056) |
| 2 | 2026-08-18 | Versioned updates Phase 1: version-gate migration fetching and tolerance (#778); Index every pack's rules and checks with words, severity and reason (#915); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | static-website pack: date-anchored versions, release-on-push, explicit publish set (#611); static-website: four rules for the data the page fetches (#727); static-website: let a build read the repo variables it declares (#729); Versioned updates Phase 0: version scaffolding (#769) |
