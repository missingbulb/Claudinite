# Version history

Records for `packs/claudinite-canon-curation/pack.mjs`'s `version` field, one row per bump.

| Version | Date | What changed |
|---|---|---|
| 60831.2 | 2026-08-31 | New world-scope rule `pack-version-log-ordered`: a pack's `VERSIONS.md` rows must run strictly descending by version, newest first, since nothing stated or held that and a long file's tail drifted out of sequence (#1542). |
| 60831.1 | 2026-08-31 | First canon version. Promoted from the canon home's `canon-curation` local pack and generalized over any canon: the write surface is the `packs/` shelf plus whatever `write_paths` declares, the skill check is anchored on a pack tree instead of the engine's own tracked registry, and the prose names a canon rather than this one. It also takes `generate-project-instructions` from `claudinite-growth` — the pack-writing method its two tasks apply, and a canon-side decision a member should not be carrying (#1537). |
