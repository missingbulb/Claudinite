# Version history

Records for `packs/python/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60904.2 | 2026-09-04 | The extra-declaration rule moves out of `RULES.md` into the `python-optional-deps` skill, now forced for `pyproject.toml`, `setup.cfg` and `setup.py` (root or one directory down) (#1662). |
| 60904.1 | 2026-09-04 | The optional-deps checks' `doc:` pointers name their skill at `packs/python/skills/…`, the path the tree carries (#1675). |
| 60903.1 | 2026-09-03 | A skill's `SKILL.md` opens on what to do, not on what the skill is: the self-describing framing and the pointers to prose the reader already holds are gone. |
| 60902.1 | 2026-09-02 | The three rules become trigger-keyed bullets at the prose ration (280 words to 150); the descriptive framing moves to the pack README. |
| 60823.1 | 2026-08-23 | Names the member settings file by its current name in its README (#1252). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 2 | 2026-08-18 | Index every pack's rules and checks with words, severity and reason (#915); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | python pack: optional-dep discipline as skill-owned checks + residue prose (#345); Vendored-mount surface shrink: engine/ consolidation, skills into packs, no CI stub, minimal CLAUDE.md + .gitignore (#384); Tighten every RULES.md to when + what + one non-obvious fact (#467); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); Commit-separation rule, and the three defects the deletion-test sweep surfaced (#560); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); Versioned updates Phase 0: version scaffolding (#769) |
