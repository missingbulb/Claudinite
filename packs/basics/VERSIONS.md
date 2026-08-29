# Version history

Records for `packs/basics/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60821.4); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60829.1 | 2026-08-29 | Working discipline: declaring a repo the new home of a role a retiring predecessor already filled means copying the predecessor's actual content in the same change as the declaration, and acting on a gap your own tooling already surfaced rather than leaving it for a human. Lifted from missingbulb/Shepherd's local pack. |
| 60827.2 | 2026-08-27 | `do-later` can defer onto a *moment*: a time-worded ask ("check tomorrow") rides the queue's `Not-before:` wait field instead of falling through to "queues immediately" (#1393). |
| 60824.1 | 2026-08-24 | The `task-janitor` task moves to the new `claudinite-tasks` pack, which owns the queue it sweeps (#1317). |
| 60823.1 | 2026-08-23 | Prose and skills name the member settings file by its current name, `.claudinite-settings.json` (#1252). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60827.1 | 2026-08-27 | The task-janitor's queue sweep parks with ONE label — `task:status:needs-human-<kind>` — rather than the `needs-human` pair a half-applied swap could tear (#1119). |
