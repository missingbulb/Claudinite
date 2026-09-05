# Version history

Records for `packs/html/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60901.1 | 2026-09-01 | Recovers the rationale #467 cut from four rules into a new `references.md`. Verifying the `<p>` auto-close against jsdom 30.0.1 showed the rule's `innerHTML` trigger was wrong — the behaviour keys on the `<p>` and the block being parsed together — so the rule is corrected to say so (#1571). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 2 | 2026-08-18 | Index every pack's rules and checks with words, severity and reason (#915); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128); html pack: prefer live DevTools investigation over deploy-and-guess (#172); No pack is active by default — the basics pack (né universal) is declared explicitly (#232); Promote: ambiguous slash-date → page-convention/locale rule (html pack) (#344); Tighten every RULES.md to when + what + one non-obvious fact (#467); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); Versioned updates Phase 0: version scaffolding (#769) |
