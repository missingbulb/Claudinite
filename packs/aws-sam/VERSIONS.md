# Version history

Records for `packs/aws-sam/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60903.1 | 2026-09-03 | The template-shape rules move into the new `sam-template` skill (forced for `**/template.yaml`, `**/template.yml`) and the build-dependency rules into the new `sam-build-and-deps` skill (forced for `package.json` and the template); `RULES.md` keeps the rules no file edit predicts (#1662). |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60901.2 | 2026-09-01 | Recovers the rationale #467 cut from two rules into `references.md`: esbuild's artifact impact, and why cache key and origin forwarding are set separately (#1571). |
| 60901.1 | 2026-09-01 | The pack adopts the references convention: `references.md` records `handler-path`'s origin (#136) and the esbuild `outbase` documentation it derives from, for the revalidation pass to reaffirm against (#1564). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 2 | 2026-08-18 | Pattern-check engine: structured-data (parsed JSON/YAML) assertions (#820); Declared checks are JSON, one file per pack (#827); Declarative checks: review document + the implementation it recommends (#839); Index every pack's rules and checks with words, severity and reason (#915); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128); aws-sam: two YAML-based checks (handler-path, cloudfront-authorization) via a minimal YAML parser (#137); Growth promote (2026-07-11): portable lessons into canon (#222); No pack is active by default — the basics pack (né universal) is declared explicitly (#232); Growth-promote: MV3 content-script/toolbar gotchas, non-PR CI read, AWS CLI access (#309); Vendored-mount surface shrink: engine/ consolidation, skills into packs, no CI stub, minimal CLAUDE.md + .gitignore (#384); Tighten every RULES.md to when + what + one non-obvious fact (#467); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); prose-to-checks: add the deletion test and sweep the canon with it (#552); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); Versioned updates Phase 0: version scaffolding (#769) |
