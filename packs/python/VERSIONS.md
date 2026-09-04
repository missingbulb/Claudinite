# Version history

Records for `packs/python/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60820.1); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60904.1 | 2026-09-04 | The optional-deps checks' `doc:` pointers name their skill at `packs/python/skills/…`, the path the tree carries (#1675). |
| 60903.1 | 2026-09-03 | A skill's `SKILL.md` opens on what to do, not on what the skill is: the self-describing framing and the pointers to prose the reader already holds are gone. |
| 60902.1 | 2026-09-02 | The three rules become trigger-keyed bullets at the prose ration (280 words to 150); the descriptive framing moves to the pack README. |
| 60823.1 | 2026-08-23 | Names the member settings file by its current name in its README (#1252). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60904.2 | 2026-09-04 | The extra-declaration rule moves out of `RULES.md` into the `python-optional-deps` skill, now forced for `pyproject.toml`, `setup.cfg` and `setup.py` (root or one directory down) (#1662). |
