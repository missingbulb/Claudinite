## 2026-07-12 · born · the fleet enforcer marker becomes a pack (#242)
- **Source:** the fleet maintenance planner's design, #241.
- **Reason:** fleet coverage was bespoke Claudinite infrastructure. Making the enforcer a declared
  pack let the cross-repo sweeps register as ordinary pack tasks, discovered by the engine with no
  orchestrator edit.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a manifest with no `detect` fingerprint and no marker, declared by hand: being the
  fleet enforcer is a choice one repo makes, never a property of a repository's shape, so nothing
  may suspect it.
- **Landed:** #242 (Refs #241).

## 2026-08-17 · promoted · the fleet-digest task arrives from the enforcer's local pack (#958)
- **Source:** the daily operations brief kept as a local pack in the enforcer repo.
- **Reason:** its case for staying local was that a brief carries one fleet's address and one
  owner's taste. Neither survived the code: the task ends at a written file, so it holds no
  recipient and no transport, and the taste is two defaulted knobs. What is left is fleet-shaped. A
  second enforcer repo was coming, and a second local copy of the mechanic is the tell that it
  belongs centrally.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #958 (Closes #954).

## 2026-08-19 · moved · the fleet-digest task leaves for claudinite-dashboard (#1053)
- **Reason:** the dashboard page is the only reader of the series the task writes.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the task moves whole to `claudinite-dashboard`; what stays here is the enforcer's
  `digest`, `owner` and `exclude` config, still read off this pack's entry as the legacy source, so
  no enforcer declaration had to change.
- **Landed:** #1053.

## 2026-08-20 · moved · renamed from sheepdog to claudinite-fleet-sheepdog (#1081)
- **Reason:** a pack whose subject is a Claudinite feature rather than a technology or a way of
  working carries the prefix that says so, and fleet enforcement is one.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the engine's rename map, plus a declaration-converging record. The enforcer's own
  config is the part a rename can break, because it is a fact the enforcer wrote and a declaration
  converges on its own schedule, so the config reader and the dashboard's legacy lookup both resolve
  the entry under either spelling and the old `packConfig` key is still read as written.
- **Landed:** #1081 (Closes #1079) · pack version 18.

## 2026-08-21 · moved · the inline version history leaves pack.mjs for VERSIONS.md (#1181)
- **Reason:** every pack gets one version-history file, checked by `pack-version-bumped`, so the
  manifest's header stops carrying a log that grows without bound.
- **Actor:** @missingbulb (owner).
- **Mechanism:** `VERSIONS.md` beside the manifest, one row per version.
- **Landed:** #1181 · pack version 60821.2.

## 2026-08-23 · moved · the manifest stops restating its own tree (#1248)
- **Reason:** `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` were each spelled in
  the manifest and also visible in the directory, so the two could disagree.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the pack directory is the declaration: those fields are resolved from the tree, an
  absent `detect`/`marker` means no fingerprint, coded rules live under `worldRules/`/`workRules/`
  and tests under `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release
  that reads all of it.
- **Landed:** #1248 · pack version 60822.2.

## 2026-08-27 · moved · the fleet-usage task leaves; the dashboard reads each member directly (#1358)
- **Reason:** the fleet aggregate existed so one page could see usage across members. The
  dashboard's fleet page now reads each member's own usage file as the viewer and derives coverage
  live, so the aggregate file and the task that wrote it were a second copy on a slower clock.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the task and `usage-fleet.GENERATED.json` are deleted; the reading moves to
  `claudinite-dashboard`.
- **Landed:** #1358.

## 2026-09-03 · reworded · RULES.md drops the framing the README already carries (#1634)
- **Reason:** the file loads into every enforcer session, so it carries what a session has to get
  right and nothing that describes the pack. The description was already in the README.
- **Actor:** @missingbulb (owner).
- **Landed:** #1634 · pack version 60902.3.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.
