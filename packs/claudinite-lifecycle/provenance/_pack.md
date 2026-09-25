## 2026-08-14 · born · Claudinite's own surface becomes a pack of its own (#836)
- **Source:** the mount, the declaration, bootstrapping, pack adoption and the scheduled-task
  contract were split across the two packs that happen to be seeded everywhere.
- **Reason:** neither host claimed that territory in its routing guidance, so a session extracting a
  lesson about Claudinite itself read both as an honest "no pack owns this".
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a mandatory pack: `basics` requires it, so the closure vendors its content and
  materializes its declaration wherever a declaration is written, and a seed record declares it into
  members that already exist. Both run outside any check, because activation reads the literal
  declaration.
- **Rejected:** letting the declared check be what makes the pack mandatory. It does not run in a
  member that has no entry, so it reports a lost declaration rather than being what puts it there.
- **Landed:** #836 (Closes #835, phase 1).

## 2026-08-19 · moved · renamed core to claudinite-lifecycle, and the authoring contract leaves (#1029)
- **Reason:** the pack owns a member's Claudinite status, and `core` said none of that. The
  scheduled-task authoring contract goes to the growth pack with it: those rules ask whether a task
  is written correctly, which is authoring, while every check left behind asks whether Claudinite is
  working in this repo.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the engine's rename map, applied at the four seams where a pack id is read, plus an
  engine migration record that moves the stale mount directory and rewrites the declaration.
  Activation matches a declared id literally, so a member declaring the old name while its mount
  ships the new one gets no pack at all, and this pack carries the task that would deliver the
  repair.
- **Landed:** #1029 (Closes #1022) · pack version 8.

## 2026-08-21 · moved · the inline version history leaves pack.mjs for VERSIONS.md (#1181)
- **Reason:** every pack gets one version-history file, checked by `pack-version-bumped`, so the
  manifest's header stops carrying a log that grows without bound.
- **Actor:** @missingbulb (owner).
- **Mechanism:** `VERSIONS.md` beside the manifest, one row per version.
- **Landed:** #1181 · pack version 60821.3.

## 2026-08-23 · moved · the manifest stops restating its own tree (#1248)
- **Reason:** `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` were each spelled in
  the manifest and also visible in the directory, so the two could disagree.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the pack directory is the declaration; coded rules live under
  `worldRules`/`workRules` and tests under `test/`, which no vendor set ships. `minEngineVersion`
  rises to the engine release that reads all of it.
- **Landed:** #1248 (Refs #1225, #1231) · pack version 60822.3.

## 2026-09-04 · reworded · the barriers requirement goes (#1684)
- **Reason:** it was vestigial once the isolation wall became a declared check, and the pack it
  named was being absorbed into `basics`.
- **Actor:** @missingbulb (owner).
- **Landed:** #1684 · pack version 60904.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.
