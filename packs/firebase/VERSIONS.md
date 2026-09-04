# Version history

Records for `packs/firebase/pack.mjs`'s `version` field, one row per bump. The row below is a
version-numbered comment that used to sit beside `version:` in the manifest, moved here
verbatim; nothing earlier than it was backfilled. Every bump from here forward adds its own
row.

| Version | Date | What changed |
|---|---|---|
| 60903.1 | 2026-09-03 | A skill's `SKILL.md` opens on what to do, not on what the skill is: the self-describing framing and the pointers to prose the reader already holds are gone. |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 4 | — | The firebase-release pack is absorbed here — its release standard is now the create-release-plan skill, loaded when a project plans a release rather than declared by a repo that has decided it is ready to ship. |
| 60821.1 | 2026-08-21 | This pack's inline version-history comment moved out of `pack.mjs` into this file. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60901.1 | 2026-09-01 | Recovers the rationale #467 cut from six rules into a new `references.md` — the merge-semantics frequency claim, token-vs-body identity, why rules are tested empirically, and the `.firebaserc`/timestamp/smoke-load failure modes (#1571). |
| 60903.2 | 2026-09-03 | The security-rules rules move into the new `firestore-security-rules` skill (forced for `**/firestore.rules`, `**/storage.rules`), the function-side limits and the smoke-load into the new `firebase-functions` skill (forced for `functions/**`), and the deploy layout into `create-release-plan` (now forced for `firebase.json`, `.firebaserc`); `RULES.md` shrinks to the five always-on rules (#1662). |
