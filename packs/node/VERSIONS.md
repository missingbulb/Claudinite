# Version history

Records for `packs/node/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60820.1); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60902.4 | 2026-09-03 | New blocking check `node/node-test-discovery`: the existing "`node --test` skips dot-directories" rule now has a rule module — a `node --test` invocation whose arguments resolve to no path in the tree, in `package.json` scripts or a workflow step. Lifted from missingbulb/ClaudiniteWebsite's local pack (#1409). |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60823.1 | 2026-08-23 | Names the member settings file by its current name in its config prose (#1252). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60901.1 | 2026-09-01 | Recovers the rationale #467 cut from two rules into a new `references.md`; both jsdom claims are verified empirically against jsdom 30.0.1, including that `body.innerText` is `undefined` rather than `null` (#1571). |
