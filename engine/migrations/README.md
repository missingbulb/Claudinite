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
  `{ id, config }` added to `.claudinite-checks.json`'s `packs` when absent, filling in a `config`
  only where the entry has none, because a pack the repo already declares (and the parameters it
  chose) are that repo's decisions. It is the shape a fleet-wide *capability* change has: a pack
  every member should run, whose parameters the canon knows and the member cannot derive
  (`materialize` would clobber a per-repo declaration; `rewrite` has no literal in common across
  repos). Declaring a pack whose code is not yet in the member's mount would be a blocking `config`
  error there, so baselining **re-converges the mount** whenever this pass changed the declaration.
  All honor an optional `appliesTo(read)` gate so a migration only touches the repos it's meant for
  (never the canon itself). [`apply.mjs`](apply.mjs) runs all four over a checkout
  (`node migrations/apply.mjs`); idempotent, a no-op once done. Each member migrates **itself**:
  baselining runs the applier from the fresh canon clone it fetched, **after** the vendor step, so a
  key and the engine version that accepts it always land in the same transactional commit. There is
  no fleet-wide apply pass and no central delivery — the member's own maintenance commit carries its
  migration writes.

## Relevance is decided at fetch time, not by a cleanup pass

There is no retirement, no archive, and no TTL mover. All records are equal; three readers each take
the slice they need:

- **Apply/backfill** ([`loadMigrations`](registry.mjs)) loads **every** record present. In a fresh
  canon clone that is the full history, so a dormant project that fell behind and only now baselines
  still catches up on everything it missed — `apply.mjs` is idempotent, so records it already
  applied are no-ops.
- **Vendoring** ([`compute-vendor-set.mjs`](../../vendoring/compute-vendor-set.mjs)) ships a consumer
  mount only the records landed within the last **7 days**
  (`recordDirIsRecent`, [engine/checks/helpers/active-migrations.mjs](../checks/helpers/active-migrations.mjs)).
  A project up to speed on migrations therefore carries few-to-none locally — it already applied
  them — and the mount stays small.
- **Check-tolerance** ([`migrationActive(slug)`](../checks/helpers/active-migrations.mjs))
  answers true only for a record that is present **and** within that same window — one shared
  predicate, so "recent enough to tolerate" and "recent enough to vendor" can never drift. Every
  up-to-date repo converges within the window, and a dormant one is converged by baselining's apply
  step *before* its checks run, so an aged record needs no tolerance anywhere.

A tolerance that cannot be expressed through `migrationActive`/`resolvePath` — one living inline in
a check or script — is swept by hand when the transition is over; the record itself just stays, as
history.

## Adding one

1. Drop a `<flow>/migrations/<landed-date>-<slug>/migration.mjs` exporting the spec above (folder
   prefix = the `landed` date), under the flow whose change it repairs — `engine/migrations/` for an
   engine contract, `packs/<pack>/migrations/` for one pack's. Structural discovery picks it up —
   no list to edit.
2. Point every reader of the old path at `resolvePath(...)`, or gate an inline tolerance on
   `migrationActive('<slug>')` so it ends itself when the record ages out of the window.
3. There is no step 3 — the record ships to consumers for 7 days, every member applies it on its own
   next converge, and the folder remains here as the durable backfill for the long tail.
