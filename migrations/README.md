# Baseline migrations (`migrations/`) — declared, self-retiring path relocations

> The **baseline migrations** mechanism: named for *when* it runs — baselining applies and retires
> each one. The directory and code identifiers stay `migrations/` / `*Migrations`; "baseline
> migration" is what to call the mechanism.

When the canon renames or relocates an artifact that consumers hold their own copy of — a tracked
file, a `settings.json` registration, a stub, a path a check or script references — the consumer's
copy doesn't move on its own. Historically each such rename grew its own scattered tolerance
(`LEGACY_STUB_NAMES` in a check, a `.gitkeep` fallback in the sync script and again in the census, a
Part-3b step in bootstrap) with **no single home and no signal for when it was safe to delete**.
[consumer-safe-changes.md](../consumer-safe-changes.md) named the gap: *"We don't yet have fleet-wide
telemetry for 'everyone has migrated', so dropping a legacy tolerance later is a judgment call."*

A **baseline migration** closes that gap: one declarative record per in-flight rename, discovered
structurally (any `migrations/<file>.mjs`, like packs and skills), that supplies the read-side
resolver, the write-side rename, and the fleet telemetry that **retires it automatically once every
repo has moved**.

## A baseline migration

```js
// migrations/2026-07-13-mount-folder-relocation.mjs
export default {
  id: 'mount-folder-relocation',
  landed: '2026-07-13',                 // date it merged to canon (YYYY-MM-DD)
  summary: 'sync hook + orchestrator + env-setup bundled into .claudinite/mount/',
  aliases: [{ canonical: '.claudinite/mount/sync-claudinite.sh',
              legacy: ['.claudinite/sync-claudinite.sh', '.claude/hooks/sync-claudinite.sh'] }],
  legacyPresent: async (exists) => exists('.claudinite/sync-claudinite.sh'),
  retire: 'auto',                       // default; 'manual' when tolerance is still inline
};
```

## Three jobs, three consumers

- **Read — "prefer Y, fall back to X".** [`resolvePath(migrations, canonical)`](registry.mjs) returns
  `[canonical, ...legacy]`. A tolerance point (a check, a script) consults this instead of hardcoding
  its own `LEGACY_*` constant, so the accepted shapes for a path are declared **once, here**.
- **Write — "and rename X → Y" (plus vendor and rewrite).** [`applyFileAliases`](registry.mjs) moves
  each legacy file to its canonical path when the legacy exists and the canonical doesn't. Two more
  write ops cover relocations a rename can't express:
  [`applyMaterializations`](registry.mjs) **vendors** a pack's templates into the repo's own tree
  (copies each `{ template, dest }` from the canon/mount to the consumer, overwriting on drift), and
  [`applyRewrites`](registry.mjs) applies in-place `{ file, replace: [{ from, to }] }` edits
  (repointing refs while preserving the rest of the file). Both honor an optional `appliesTo(read)`
  gate so a migration only touches the repos it's meant for (never the canon itself).
  [`apply.mjs`](apply.mjs) runs all three over a checkout (`node migrations/apply.mjs`); idempotent, a
  no-op once done. In the fleet, the **baselining** performs the equivalent writes over the GitHub API
  through its own idempotent [bootstrap.md](../bootstrap.md) / worker steps.
- **Retire — the telemetry.** The [fleet-coverage census](../packs/sheepdog/check-fleet-coverage.mjs), which
  already visits every repo with an account-spanning token, evaluates each migration's `legacyPresent`
  across the fleet and reports how many repos still carry the legacy shape. When one is fully applied
  it **deletes the migration file automatically** — and, for a migration that relocated canon
  plumbing into the consumers, first deletes the home-repo files it names in `retireDeletesFromHome`
  (the automatic phase-2 cut: the canon ends with no leftovers once the fleet has vendored the copy).
  See the guard below.

## The retirement guard (smart, not overzealous)

`retirableMigrations` retires a migration only when **all** hold:

1. the census classified **every** repo (`unknown === 0`) — an API error must never hide a holdout;
2. **zero** repos still carry the legacy shape;
3. it landed **strictly before today** (≥ one nightly cycle, so a baselining pass has had a chance
   to migrate everyone — a migration is never retired the night it lands); and
4. `retire !== 'manual'`.

Set **`retire: 'manual'`** when the migration's tolerance still lives inline somewhere the resolver
doesn't yet drive — deleting the record alone would strand that inline tolerance. Flip it to `'auto'`
in the same change that wires the last reader to `resolvePath`. Auto-retirement deletes **only the
migration file**; because a fully-wired migration's tolerance lives entirely in that file (via the
resolver), the delete removes the record and the tolerance in one step.

## Adding one

1. Drop a `migrations/<landed-date>-<slug>.mjs` exporting the spec above. Structural discovery picks it
   up — no list to edit.
2. Point every reader of the old path at `resolvePath(...)`; perform the consumer-side rename through
   baselining's own steps (and `apply.mjs` for local checkouts).
3. Leave `retire: 'auto'` if the tolerance is fully expressed here; else `'manual'` with a comment
   naming the inline holdouts. The census does the rest.
