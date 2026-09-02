# Version history

Records for `packs/product-wiki/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60820.1); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60902.2 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60902.1 | 2026-09-02 | `wiki-growth` converts to `preconditions: ['repo-active', 'no-open-pr-touching:product-wiki/']`. The pending-round gate is unchanged in substance (an open PR whose paths could not be read still counts as pending); what is new is that the pass now sleeps on a repo nobody works in, and resumes on the first active window (#1578). |
| 60830.3 | 2026-08-30 | `wiki-growth` authorizes `under:product-wiki/ && doc-changes` instead of the repo-wide `doc-changes`, so the round may land Markdown inside the tree it already anchors its precondition on, and a doc elsewhere or a non-doc file inside the wiki parks it for review (#1473). |
| 60830.2 | 2026-08-30 | `wiki-growth` declares `automerge: ['doc-changes']` — the wiki is Markdown pages, and anything else in a round's diff parks it for review (#1459). |
| 60830.1 | 2026-08-30 | Bundles the `explore-link` skill — the owner-given-source growth lane (#1421). |
| 60824.1 | 2026-08-24 | Prose names the scheduler at its new home in the `claudinite-tasks` pack (#1317). |
| 60823.3 | 2026-08-23 | `wiki-growth` gates on an open PR's pending `product-wiki/` paths instead of a `product-wiki-growth` label. |
| 60823.2 | 2026-08-23 | Its isolation rule excepts both settings-file names while the #1252 rename drains. |
| 60823.1 | 2026-08-23 | `wiki-growth` drops its standing tracker — the wiki's own git history is the record, and a blocked pass converges through the run's outcome. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
