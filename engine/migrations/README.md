# Baseline migrations (`engine/migrations/`) — declared path relocations, applied by each member itself

> The **baseline migrations** mechanism, and the machinery that runs it (this README,
> `registry.mjs`, `apply.mjs`). Every migration ever landed lives in one folder —
> `<landed-date>-<slug>/migration.mjs` — **under the flow that owns it**: an engine change beside
> this file, a pack's own change under `packs/<pack>/migrations/`
> (docs/versioned-updates/DESIGN.md §3.7). Discovery walks both, so a caller never asks which.
> Records are never retired, archived, or deleted: the full history is the durable backfill
> source, and **fetching decides relevance** — vendoring ships a consumer only the records landed
> within the last 7 days, while a dormant project baselining out of a fresh canon clone sees them
> all and applies what it needs. The code identifiers stay `*Migrations`; "baseline migration" is
> what to call the mechanism.

When the canon renames or relocates an artifact that consumers hold their own copy of — a tracked
file, a `settings.json` registration, a stub, a path a check or script references — the consumer's
copy doesn't move on its own. Historically each such rename grew its own scattered tolerance
(`LEGACY_STUB_NAMES` in a check, a `.gitkeep` fallback in the sync script and again in the census, a
Part-3b step in bootstrap) with **no single home**. A **baseline migration** closes that gap: one
declarative record per rename, discovered structurally (any `<flow>/migrations/<date>-<slug>/migration.mjs`,
like packs and skills), that supplies the read-side resolver and the write-side rename.

## A baseline migration

```js
// An illustrative record (the shape, not a live migration): the historical
// mount-folder relocation, which moved the tracked sync hook into mount/.
// Lives at engine/migrations/2026-07-13-mount-folder-relocation/migration.mjs.
export default {
  id: 'mount-folder-relocation',
  landed: '2026-07-13',                 // date it merged to canon (YYYY-MM-DD; = the folder prefix)
  version: 4,                           // the OWNING FLOW's version this change takes effect at —
                                        // a repo below it still needs the record, one at or above
                                        // it has already had it applied. Land it with that bump.
  summary: 'sync hook + orchestrator + env-setup bundled into a mount folder',
  aliases: [{ canonical: '.claudinite/mount/sync-claudinite.sh',
              legacy: ['.claudinite/sync-claudinite.sh', '.claude/hooks/sync-claudinite.sh'] }],
  legacyPresent: async (exists) => exists('.claudinite/sync-claudinite.sh'),
};
```

## Two jobs, two consumers

- **Read — "prefer Y, fall back to X".** [`resolvePath(migrations, canonical)`](registry.mjs) returns
  `[canonical, ...legacy]`. A tolerance point (a check, a script) consults this instead of hardcoding
  its own `LEGACY_*` constant, so the accepted shapes for a path are declared **once, here**.
- **Write — "and rename X → Y" (plus vendor, rewrite and declare).** [`applyFileAliases`](registry.mjs) moves
  each legacy file to its canonical path when the legacy exists and the canonical doesn't. Three more
  write ops cover changes a rename can't express:
  [`applyMaterializations`](registry.mjs) **vendors** a pack's templates into the repo's own tree
  (copies each `{ template, dest }` from the canon/mount to the consumer, overwriting on drift),
  [`applyRewrites`](registry.mjs) applies in-place `{ file, replace: [{ from, to }] }` edits
  (repointing refs while preserving the rest of the file), and
  [`applyPackDeclarations`](registry.mjs) **declares a pack** the member doesn't carry yet — each
  `{ id, config }` added to `.claudinite-settings.json`'s `packs` when absent, filling in a `config`
  only where the entry has none, because a pack the repo already declares (and the parameters it
  chose) are that repo's decisions. It is the shape a fleet-wide *capability* change has: a pack
  every member should run, whose parameters the canon knows and the member cannot derive
  (`materialize` would clobber a per-repo declaration; `rewrite` has no literal in common across
  repos). Declaring a pack whose code is not yet in the member's mount would be a blocking `config`
  error there, so baselining **re-converges the mount** whenever this pass changed the declaration.
  All honor an optional `appliesTo(read)` gate so a migration only touches the repos it's meant for
  (never the canon itself). [`apply.mjs`](apply.mjs) runs all four over a checkout
  (`node engine/migrations/apply.mjs`); idempotent, a no-op once done. Each member migrates **itself**:
  the update flows run the applier from the fresh canon clone they fetched, **after** the vendor step, so a
  key and the engine version that accepts it always land in the same transactional commit. There is
  no fleet-wide apply pass and no central delivery — the member's own maintenance commit carries its
  migration writes.

## The version a record declares

`version` is the number of the flow that owns the record — the engine's
(`engine/RELEASES.md`) for a record under `engine/migrations/`, that pack's for one
under `packs/<pack>/migrations/` — **at which its change takes effect**. So a record
lands in the same change as the bump it names, and the whole question "does this
record still apply to that repo" is `record.version > repo's installed version`
(`migrationApplies`, in the engine helper).

Keep the field a **plain integer literal on its own line**. Every caller of the
predicate is synchronous — `migrationActive` is called from inside check bodies —
so the version is read out of the source rather than by importing the spec, and a
computed or inlined value would be invisible to that read. The two readings are
drift-guarded by a test that imports every real record and compares.

## Relevance is decided at fetch time, not by a cleanup pass

There is no retirement, no archive, and no TTL mover. All records are equal; three readers each take
the slice they need:

- **Apply/backfill** ([`loadMigrations`](registry.mjs)) loads **every** record present. In a fresh
  canon clone that is the full history, so a dormant project that fell behind and only now baselines
  still catches up on everything it missed — `apply.mjs` is idempotent, so records it already
  applied are no-ops.
- **Vendoring** ([`compute-vendor-set.mjs`](../../vendoring/compute-vendor-set.mjs)) ships a consumer
  mount only the records **above the versions that repo has installed**
  (`migrationApplies`, [engine/checks/helpers/active-migrations.mjs](../checks/helpers/active-migrations.mjs)).
  An up-to-date repo carries none; a lagging one carries exactly its gap, however old those records
  are. A repo whose stamp says nothing about a flow — one that has not converged since versions
  existed, or a fresh adoption — falls back to the landed-date window (7 days), which is what every
  member had before versions: unknown is answered as unknown, never as version zero.
- **Check-tolerance** ([`migrationActive(slug)`](../checks/helpers/active-migrations.mjs))
  answers true only for a record that is present **and** still applies by that same predicate — one
  shared function, so "shipped to the mount" and "tolerated by a check" can never mean different
  things. In a member the answer therefore reduces to "is the record in my mount": the gate that put
  it there is the gate that tolerates it.

A tolerance that cannot be expressed through `migrationActive`/`resolvePath` — one living inline in
a check or script — is swept by hand when the transition is over; the record itself just stays, as
history.

## Adding one

1. Drop a `<flow>/migrations/<landed-date>-<slug>/migration.mjs` exporting the spec above (folder
   prefix = the `landed` date), under the flow whose change it repairs — `engine/migrations/` for an
   engine contract, `packs/<pack>/migrations/` for one pack's. Structural discovery picks it up —
   no list to edit. Declare the `version` its change takes effect at, and bump that flow's version in
   the same change; without a version the record falls back to the date window and stops applying
   after 7 days, whatever state the fleet is in.
2. Point every reader of the old path at `resolvePath(...)`, or gate an inline tolerance on
   `migrationActive('<slug>')` so it ends itself when the record ages out of the window.
3. There is no step 3 — the record ships to consumers for 7 days, every member applies it on its own
   next converge, and the folder remains here as the durable backfill for the long tail.
