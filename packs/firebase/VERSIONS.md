# Version history

Records for `packs/firebase/pack.mjs`'s `version` field, one row per bump. The row below is a
version-numbered comment that used to sit beside `version:` in the manifest, moved here
verbatim; nothing earlier than it was backfilled. Every bump from here forward adds its own
row.

| Version | Date | What changed |
|---|---|---|
| 4 | — | The firebase-release pack is absorbed here — its release standard is now the create-release-plan skill, loaded when a project plans a release rather than declared by a repo that has decided it is ready to ship. |
| 60821.1 | 2026-08-21 | This pack's inline version-history comment moved out of `pack.mjs` into this file. |
| 60822.1 | 2026-08-22 | `id`, `prose`, `badge` and `skills` come from the pack directory rather than the manifest (#1246); `minEngineVersion` rises to the engine release that reads them. |
