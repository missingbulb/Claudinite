# The vendored mount — persist Claudinite in each consumer, update nightly (design)

> **Status: agreed direction (issue #315), phase 0 implemented.** This doc is the decision record
> for replacing the session-start fetch with a tracked, nightly-updated vendor of the corpus. The
> live mount ([README.md](README.md)) keeps working unchanged until the transition phases land;
> what ships today is this record plus the vendor-set computation ([vendor.mjs](vendor.mjs)).

## The problem

Both mount methods re-fetch the corpus at every session start — Method B pulls the latest-`main`
tarball, Method A updates the submodule. That makes session start network-dependent and fragile:
the fetch halt-gate, the `codeload.github.com` allowlist requirement, the `.claudinite.new` swap,
and the tracked-copy preservation dance in the sync hook all exist only to manage fetch failure.
The freshness the fetch buys is not needed: the core rarely changes, packs change roughly
nightly, and nothing requires immediate propagation. So the per-session fetch pays a reliability
cost every session for a latency guarantee nothing uses.

## The model

**A consumer holds a vendored, tracked `.claudinite/`** — ordinary committed files, the same move
issue #276 already made for the release workflows, applied to the whole corpus. The **nightly
maintenance is the only regular writer**. Consequences, each a deliberate decision:

1. **Minimal set, derived from the declaration.** The vendor set is a function of
   `.claudinite-checks.json`: the engine (`checks/` runner + lib + hooks), the mount machinery,
   the packs/skills machinery, the **declared packs** with their `requires` closure, the **union
   of those packs' skills**, `preferences/`, and the corpus index (`CLAUDE.md`). Tests
   (`*.test.mjs`) and canon-internal trees (`routines/`, `docs/`, `.github/`, maintainer docs)
   are not vendored. A basics-only repo carries ~240 KB. The computation is
   [vendor.mjs](vendor.mjs); `.claudinite/local_packs/` is consumer-owned content the vendor set
   never touches. Two accepted edges: a newly declared pack has no local content until the next
   refresh (the engine's unknown-pack `config` error surfaces a declared-but-absent pack loudly,
   nothing fails silently), and links from vendored docs to non-vendored canon files may dangle
   locally by design (the sweep never inspects vendored files — see the marking below).
2. **Transactional nightly update.** Per repo and per night: apply the pending migration notes,
   converge the vendored tree to the canon snapshot, advance the stamp — **one commit**. If the
   migration fails, nothing is written: the repo keeps running its old snapshot exactly as
   before, is retried the next night, and the failure lands in the fleet routine's failure log.
   The commit honors the repo's `maintenance.delivery` (`push` or `pr`). The refresh is
   **unconditional convergence** (copy-if-different, not copy-if-canon-moved), so an accidental
   local edit to a vendored file reverts within a day, visibly in the nightly's diff — that, plus
   a one-line "canon-owned; propose changes upstream" note, is the whole anti-drift story; there
   is deliberately no manifest/integrity framework.
3. **The stamp.** `"claudinite": { "updated": "YYYY-MM-DD", "ref": "<sha>" }` in
   `.claudinite-checks.json` — `updated` selects which migration notes still apply, `ref` is
   provenance for debugging. **One stamp for the whole set, never per pack**: updates are
   whole-set atomic, because mixed per-pack versions inside one repo would recreate exactly the
   engine↔pack skew this design eliminates (declaring a new pack therefore triggers a whole-set
   refresh, not a lone pack copy). `loadConfig` learns the key when the stamp ships (phase 1) —
   until then it would be rejected as an unknown setting.
4. **Pinning semantics.** Each branch runs the snapshot committed on it: a session, its Stop
   hook, and CI all judge by the same law, and a canon change affects no consumer until that
   consumer's own nightly commit. Consumer CI becomes a three-line workflow running
   `node .claudinite/checks/run.mjs` from the checkout — the backstop
   [checks/README.md](../checks/README.md) names finally has standard wiring. Rollback is
   per-repo and atomic: revert the nightly's commit.
5. **`linguist-vendored` marking.** Consumer `.gitattributes` marks `.claudinite/**`
   `linguist-vendored` and unsets it for `.claudinite/local_packs/**`. This is load-bearing
   twice: the engine drops vendored files from the sweep's file set, keeping every consumer
   check off the canon's own files, and it makes the corpus-shape checks (catalog-completeness,
   skill-ownership) naturally inert outside the canon repo. Phase-1 verification item: those
   checks must read the engine's `ctx.files`, never the filesystem directly, for the exclusion
   to hold against a pruned tree.
6. **Isolation, on the barriers engine.** Consumer files must not reference `.claudinite/`
   except the wiring set: the root `CLAUDE.md` (the `@`-import and self-check), `.claude/`
   (settings hook registrations), `.gitignore`, `.gitattributes`, `.github/workflows/` (the CI
   stub), and anything under `.claudinite/` itself (`local_packs/` included). Product code that
   wants a canon helper inlines it — depending on canon internals would turn every canon
   refactor into a breaking migration for code the canon doesn't own. Enforced as a **basics
   check composed on the barriers pack's exported detection engine** — the composition pattern
   packs already use with each other — so it is universal via basics, with no per-project
   barriers declaration or config to maintain; it self-gates on `.claudinite/` existing, so it
   is inert in the canon repo.
7. **Migration notes v2.** A canon change that consumers must be amended for ships as a dated
   record (the existing `migrations/active_migrations/` shape): mechanical ops where code can
   express them, plus a **brief agentic note** for what it can't (chiefly adapting
   consumer-authored `local_packs/` content to a changed engine contract). The nightly applies
   the notes dated after the repo's stamp, oldest first, inside the one transactional commit. No
   read-side tolerances in live code, no `LEGACY_*` constants, and **no per-consumer state held
   in the canon** — the stamp in each consumer is the only bookkeeping. **Retirement is a
   retention window**: a note is deleted ~5 weeks after landing; a repo lagging longer has been
   failing loudly in the nightly log (or was off the access list), and its catch-up path is
   re-running adoption, which vendors head idempotently. The one surviving two-phase case is
   **out-of-repo state** no commit can reach — the pasted web-environment Setup script keeps the
   probe + halt-gate pattern ([consumer-safe-changes.md](../consumer-safe-changes.md)).
8. **Accepted trade-off.** A bad canon change (typically an overzealous blocking check) reaches
   consumers on one nightly and its fix on a later one — up to ~two days' exposure. Dampers: the
   Stop hook's own two-block self-release, per-repo `rules`/`accept` overrides, and an on-demand
   refresh (the nightly's update step run in-session) as the pull-forward/emergency lane.

**What this retires:** the per-session fetch and its halt-gate, the `codeload.github.com`
allowlist prerequisite, `CLAUDINITE_REF` pinning (the commit *is* the pin), the
`.claudinite.new` swap and tracked-copy preservation, the Method A/B split with the submodule
caveats, and the stale-mount caveat in [checks/README.md](../checks/README.md). Session start
becomes a single offline SessionStart entry invoking [session-start.sh](session-start.sh)
directly (its four steps and the preferences/env halt-gates are unchanged); the `CLAUDE.md`
self-check line remains the absent-corpus tell. The plugin-packaging rationale in
[checks/DESIGN.md](../checks/DESIGN.md) also loses its update-latency premise — recorded there
when the transition completes. The canon repo itself is untouched: it runs its own live tree
and mounts nothing.

## Applying it to the fleet — the transition

Per [consumer-safe-changes.md](../consumer-safe-changes.md): pilot on one real consumer before
the nightly touches everyone, and never break the channel the migration itself travels through.

- **Phase 0 (this change):** this record + [vendor.mjs](vendor.mjs), the vendor-set computation
  everything else builds on.
- **Phase 1 — canon capabilities:** the baselining task absorbs the vendor refresh (converge
  set + apply notes + stamp, one commit); the adoption flow and [bootstrap.md](../bootstrap.md)
  are rewritten **fresh-path-only** around the vendored mount (today's legacy-convergence steps
  collapse into dated notes); `loadConfig` gains the `claudinite` key; the gitignore flip rules
  (drop every `.claudinite/*` ignore/negation, keep the hooks-log ignores), the
  `.gitattributes` marking, the consumer CI stub, and the isolation check land.
- **Phase 2 — the flip:** a dated note converts each member in one commit — write its vendor
  set, flip `.gitignore`, add `.gitattributes`, rewrite the `SessionStart` entry to invoke the
  orchestrator directly, stamp the declaration, delete the tracked sync hook. Fleet discovery
  accepts **both** membership shapes (the tracked sync hook *or* the stamped declaration file)
  for the whole transition — the sync hook is today's discovery signal, and a probe that only
  recognizes the new shape would silently orphan every unmigrated repo. A session already
  running when the flip lands keeps its old wiring against its old snapshot — coherent — and
  picks the new world up next session.
- **Phase 3 — converge and retire:** once every member is flipped, discovery goes
  single-shape, `sync-claudinite.sh` is deleted from the canon, bootstrap's remaining legacy
  steps are pruned, and [consumer-safe-changes.md](../consumer-safe-changes.md) is rewritten to
  the new, much smaller channel model (tracked-vendor commit + notes; the instant `@main` and
  session-sync channels are gone).

## The vendor-set contract ([vendor.mjs](vendor.mjs))

`computeVendorSet(declaredEntries, { extraSkills })` → `{ files, errors }`, computed against the
canon tree the module ships in. `files` is the sorted, repo-relative set: `ENGINE_FILES` +
`ENGINE_DIRS` walks + each resolved canon pack's directory + the skills union — always excluding
`*.test.mjs`. Declared ids that name no canon pack (a consumer's local packs, or a typo the
runner's settings validation already flags) are skipped without error; a pack-required skill
missing from the tree is reported in `errors`. `extraSkills` lets a caller add skills the canon
can't see — e.g. ones required by a member's own local packs.
