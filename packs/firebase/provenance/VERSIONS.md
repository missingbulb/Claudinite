# Version history

Records for `packs/firebase/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60903.2 | 2026-09-03 | The security-rules rules move into the new `firestore-security-rules` skill (forced for `**/firestore.rules`, `**/storage.rules`), the function-side limits and the smoke-load into the new `firebase-functions` skill (forced for `functions/**`), and the deploy layout into `create-release-plan` (now forced for `firebase.json`, `.firebaserc`); `RULES.md` shrinks to the five always-on rules (#1662). |
| 60903.1 | 2026-09-03 | A skill's `SKILL.md` opens on what to do, not on what the skill is: the self-describing framing and the pointers to prose the reader already holds are gone. |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60901.1 | 2026-09-01 | Recovers the rationale #467 cut from six rules into a new `references.md` — the merge-semantics frequency claim, token-vs-body identity, why rules are tested empirically, and the `.firebaserc`/timestamp/smoke-load failure modes (#1571). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60821.1 | 2026-08-21 | This pack's inline version-history comment moved out of `pack.mjs` into this file. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 4 | — | The firebase-release pack is absorbed here — its release standard is now the create-release-plan skill, loaded when a project plans a release rather than declared by a repo that has decided it is ready to ship. |
| 3 | 2026-08-19 | Collapse chrome-extension-release into chrome-extension, and stop packs discussing each other (#1060) |
| 2 | 2026-08-18 | The remaining conversion tranches: work scope, and files named by a parsed field (#908); Index every pack's rules and checks with words, severity and reason (#915); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | Add executable-requirements pack; fill the flutter pack stub (#165); firebase pack: detect a firebase.json one directory down (project-root layout) (#190); No pack is active by default — the basics pack (né universal) is declared explicitly (#232); prose-to-checks: convert the firebase deploy-layout rules to checks (#451); Tighten every RULES.md to when + what + one non-obvious fact (#467); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); Versioned updates Phase 0: version scaffolding (#769) |
