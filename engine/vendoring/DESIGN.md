# The vendored mount — persist Claudinite in each consumer, update nightly (design)

> **Status: agreed direction (issue #315); phase 0 implemented, phase 1 in progress.** This doc is
> the decision record for replacing the session-start fetch with a tracked, nightly-updated
> vendor of the corpus. The live mount ([README.md](README.md)) keeps working unchanged until the
> transition phases land.

## The problem

Both mount methods re-fetch the corpus at every session start — Method B pulls the latest-`main`
tarball, Method A updates the submodule. That makes session start network-dependent and fragile:
the fetch halt-gate, the `codeload.github.com` allowlist requirement, the `.claudinite.new` swap,
and the tracked-copy preservation dance in the sync hook all exist only to manage fetch failure.
The freshness the fetch buys is not needed: the core rarely changes, packs change roughly
nightly, and nothing requires immediate propagation. So the per-session fetch pays a reliability
cost every session for a latency guarantee nothing uses.

## The model

**A consumer holds a vendored, tracked corpus at `.claudinite/shared/`** — ordinary committed
files at canon-relative paths, the same move issue #276 already made for the release workflows,
applied to the whole corpus. The **nightly maintenance is the only regular writer**.

1. **The `shared/` root is a submodule emulation.** The set materializes under
   `.claudinite/shared/` mirroring the canon layout exactly, so the planned future — mounting
   Claudinite as a **git submodule** at that same path, once sessions run where a cross-repo git
   credential exists — is a drop-in upgrade: the submodule lands a superset at the same root and
   **no wiring path changes**
   (`node .claudinite/shared/engine/hooks/stop-command.mjs`, …). This is also why nothing consumer-owned
   lives inside it: `.claudinite/local_packs/` sits *beside* `shared/`, which the submodule
   future outright requires — a submodule directory cannot carry the consumer's files.
2. **Minimal set, derived structurally from the declaration.** The vendor set is a function of
   `.claudinite-checks.json`, computed by [vendor.mjs](compute-vendor-set.mjs) with **no hand-maintained
   file list**: the one engine root (`engine/`) vendored wholesale, plus the **declared packs**
   with their `requires` closure — each pack's bundled skills riding its own directory (#385).
   There is no corpus-index `CLAUDE.md` and no consumer `@`-import: a session's rules arrive
   injected (#385). Excluded
   everywhere: tests; excluded at the engine root: `*.md` (canon-maintainer docs are read
   upstream when needed — a pack's `.md` files are the payload and ride their
   directories). Canon-internal trees (`routines/`, `docs/`, `.github/`, root maintainer docs)
   are never vendored. Two accepted edges: a newly declared pack has no local content until the
   next refresh (the engine's unknown-pack `config` error surfaces a declared-but-absent pack
   loudly), and links from vendored docs to non-vendored canon files may dangle locally by
   design (the sweep never inspects the shared mount — see 6).
3. **Preferences are never vendored** — per-user settings, not project content. The
   session-start step ([inject-preferences.sh](../hooks/steps/inject-preferences.sh), mount machinery now)
   reads the local `preferences/<email>.md` when its tree carries one (the canon repo; a future
   submodule mount; the interim full-tarball sync) and otherwise **fetches just that file** over
   HTTPS, fresh each session. Every miss — no email, no file, fetch failure — is **fail-soft**:
   a one-line note and the session proceeds on defaults. The halt-gate is reserved for the
   load-bearing corpus, which after the flip is always local and can't miss.
4. **Transactional nightly update.** Per repo and per night: apply the pending migration notes,
   converge the vendored tree to the canon snapshot, advance the stamp — **one commit**. (One
   MCP reality: file *deletions* can't ride a `push_files` commit, so convergence's prunes
   follow as their own `delete_file` commits **after** the stamped content commit — safe to
   interrupt, since the next night's convergence re-deletes stragglers; note ops are
   stamp-gated and always land with the stamp — #329.) If the
   migration fails, nothing is written: the repo keeps running its old snapshot exactly as
   before, is retried the next night, and the failure lands in the fleet routine's failure log.
   The commit honors the repo's `maintenance.delivery` — both lanes land on the
   `claudinite/maintenance` branch and its PR (`auto-merge` arms auto-merge; `review` leaves it for the owner),
   never a direct commit to the default branch; each computes its writes against the *default*
   branch, drops what the maintenance branch already carries, and refreshes that branch from base
   each night — regenerate, never reconcile — #332. The refresh is
   **unconditional convergence** (copy-if-different, not copy-if-canon-moved), so an accidental
   local edit to a vendored file reverts within a day, visibly in the nightly's diff — that,
   plus a one-line "canon-owned; propose changes upstream" note, is the whole anti-drift story;
   there is deliberately no manifest/integrity framework. Direction-blindness cuts both ways,
   so the writer carries the one **anti-rewind guard** the no-framework stance leaves room for:
   converging is refused when the checkout's HEAD mismatches the passed ref or the member's
   stamped ref is not its ancestor, and the worker verifies the checkout is at the **remote**
   head before converging — a stale maintenance checkout must fail its unit, never silently
   downgrade the fleet (#328).
5. **The stamp.** `"claudinite": { "updated": "<full ISO datetime>", "ref": "<sha>" }` in
   `.claudinite-checks.json` — `updated` selects which migration notes still apply (notes are
   day-dated, so selection is by the stamp's **day, same-day inclusive** — a note landing later
   on the stamp's day must still apply, and note idempotency absorbs the re-application this
   admits — #330), `ref` is provenance for debugging **and** the anti-rewind guard's anchor (4). **One stamp for the whole set, never per pack**: updates are
   whole-set atomic, because mixed per-pack versions inside one repo would recreate exactly the
   engine↔pack skew this design eliminates (declaring a new pack therefore triggers a whole-set
   refresh, not a lone pack copy). The engine already tolerates the key
   (`CONFIG_KEYS` in checks/lib).
6. **The shared mount is structurally out of the sweep.** The engine's file-set builder drops
   everything under `.claudinite/shared/` (`buildContext` in checks/lib) — the corpus is
   canon-owned, never the project's own code — while `.claudinite/local_packs/` stays fully in
   scope. Deliberately a structural rule in the engine, **not** a `.gitattributes` /
   `linguist-vendored` convention: the exclusion must hold on any git host and any checkout.
   This is also what keeps the corpus-shape checks (catalog-completeness, skill-ownership)
   naturally inert in consumers with a pruned tree.
7. **Pinning semantics.** Each branch runs the snapshot committed on it: a session and its Stop
   hook judge by the same law, and a canon change affects no consumer until that
   consumer's own nightly commit. There is deliberately **no consumer CI workflow** (owner
   decision, #385): the Stop hook — which blocks the session from finishing until the sweep is
   green — is the enforcement surface, and an edit made outside Claude sessions surfaces at the
   next session's Stop sweep. Rollback is per-repo and atomic: revert the nightly's commit.
8. **Isolation.** Consumer files must not reference `.claudinite/` except the wiring set:
   `.claude/` (settings hook registrations),
   `.gitignore`, `.gitattributes`, `.github/workflows/` (a repo's own workflows may run the
   vendored engine), and anything under
   `.claudinite/` itself (`local_packs/` included). Product code that wants a canon helper
   inlines it — depending on canon internals would turn every canon refactor into a breaking
   migration for code the canon doesn't own. Enforced as a **fixed barrier the baseline pack
   contributes to the barriers mechanism pack** (manifest data under `contributes`; the baseline
   `requires` barriers, so the mechanism rides everywhere the baseline is declared) — the
   declaration-and-configuration composition pattern packs use with each other, never a
   cross-pack code import (the canon-side `pack-independence` barrier) — universal via the
   baseline, with no per-project barriers config to maintain; its `gateDir` keeps it inert
   until the vendored mount exists, so it fires neither in the canon repo nor in pre-flip
   consumers.
9. **Migration notes v2.** A canon change that consumers must be amended for ships as a dated
   record (the existing `migrations/active_migrations/` shape): mechanical ops where code can
   express them, plus a **brief agentic note** for what it can't (chiefly adapting
   consumer-authored `local_packs/` content to a changed engine contract). The nightly applies
   the notes dated on or after the day of the repo's stamp (same-day inclusive, note
   idempotency absorbing the overlap — #330), oldest first, inside the one transactional commit.
   No read-side tolerances in live code, no `LEGACY_*` constants, and **no per-consumer state
   held in the canon** — the stamp in each consumer is the only bookkeeping. **Retirement is a
   retention window**: a note is deleted ~5 weeks after landing; a repo lagging longer has been
   failing loudly in the nightly log (or was off the access list), and its catch-up path is
   re-running adoption, which vendors head idempotently. The one surviving two-phase case is
   **out-of-repo state** no commit can reach — the pasted web-environment Setup script keeps
   the probe + halt-gate pattern ([consumer-safe-changes.md](../../consumer-safe-changes.md)).
10. **Accepted trade-off.** A bad canon change (typically an overzealous blocking check)
    reaches consumers on one nightly and its fix on a later one — up to ~two days' exposure.
    Dampers: the Stop hook's own two-block self-release, per-repo `rules`/`accept` overrides,
    and an on-demand refresh (the nightly's update step run in-session) as the
    pull-forward/emergency lane.

**What this retires:** the per-session fetch and its halt-gate, the `codeload.github.com`
allowlist prerequisite, `CLAUDINITE_REF` pinning (the commit *is* the pin), the
`.claudinite.new` swap and tracked-copy preservation, the Method A/B split with the submodule
caveats, and the stale-mount caveat in [engine/checks/README.md](../checks/README.md). Session start
becomes a single offline SessionStart entry invoking [session-start.sh](../hooks/session-start-command.sh)
directly (its four steps are unchanged; the preferences step is fail-soft per 3, the env-check
halt-gate stays). The consumer `CLAUDE.md` carries nothing of Claudinite's — the corpus
index, its `@`-import, and the self-check paragraph are all retired by owner decision (#385). The
plugin-packaging rationale in [engine/checks/DESIGN.md](../checks/DESIGN.md) also loses its
update-latency premise — recorded there when the transition completes. The canon repo itself is
untouched: it runs its own live tree and mounts nothing.

## Applying it to the fleet — the transition

Per [consumer-safe-changes.md](../../consumer-safe-changes.md): pilot on one real consumer before
the nightly touches everyone, and never break the channel the migration itself travels through.

- **Phase 0 (done):** this record + [vendor.mjs](compute-vendor-set.mjs), the vendor-set computation
  everything else builds on.
- **Phase 1 — canon capabilities:** the fail-soft preferences step (done); the `claudinite`
  stamp key in `loadConfig` (done); the engine's shared-mount sweep exclusion (done); the local
  vendor writer [apply-vendor.mjs](apply-vendor-set.mjs) — whole-set convergence + stamp, erroring
  before any write (done); the consumer CI stub, shipped in the baseline pack's `stubs/` (done; later retired by owner
  decision #385 — the Stop hook is the whole enforcement surface, see 7);
  the isolation check (done — the reference index builds from `ctx.tracked`, so vendored files
  stay resolvable as reference *targets* while excluded from scanning); the baselining worker
  branches on the `claudinite` stamp — vendored members get the transactional refresh
  (notes → converge → stamp, one commit), pre-flip members get legacy maintenance only, never an
  ungated flip (done); [bootstrap.md](../../bootstrap.md) rewritten around the vendored fresh path,
  with the legacy shapes quarantined in a **retiring transition appendix** the worker uses on
  unflipped members (done — the appendix, not dated notes, carries the transition-window
  maintenance; the flip note carries the conversion); fleet membership discovery reduces to the
  **single** probe every member carries whatever its mount shape — the tracked
  `.claudinite-checks.json`, the only shape the planner can plan for at all; a mount marker
  without a declaration classifies uncovered and heals through an adoption issue (done).
- **Phase 2 — the flip (shipped, pilot-gated):** the dated note
  (`migrations/active_migrations/`, `vendored-mount-flip`) converts a member in one commit —
  vendor set under `.claudinite/shared/`, the `.gitignore` flip (the legacy Claudinite ignore
  block collapses to just the two hook-log lines — the vendored world writes nothing untracked
  into `.claudinite/`; accepted trade-off per #385: during the transition window a stale
  environment's stray sync shows up as *visible* untracked noise, healed when the environment's
  Setup script is re-pasted, rather than hidden by a wholesale ignore), the
  `SessionStart`/Stop/PreToolUse rewrite to
  `shared/` paths, the legacy `CLAUDE.md` import/self-check deletion (#385), the stamp, and the
  sync-hook deletion — executed by the **baselining worker** (the mechanical passes see the
  record as a no-op; its `legacyPresent` feeds the unflipped-count telemetry), plus one
  member issue asking to re-paste the environment Setup script (the surviving out-of-repo
  action). **Gated pilot: the note names only `GoogleCalendarEventCreator`**; after a clean
  night, widening to the fleet is a one-line edit (`flip.repos: 'fleet'`). Fleet discovery is untouched by the flip —
  it keys on the tracked `.claudinite-checks.json`, which both mount shapes carry (phase 1) —
  so no member can be orphaned by its migration state. A session already running when the flip lands
  keeps its old wiring against its old snapshot — coherent — and picks the new world up next
  session.
- **Phase 3 — converge and retire:** once every member is flipped (and every cloud
  environment's Setup script re-pasted), the transition surface retires as one deliberate
  change. **The retirement ledger — everything phase 3 deletes, kept complete here** (each item
  also marked at its site; the `retire: 'manual'` notes below never auto-retire):
  1. [engine/vendoring/sync-claudinite.sh](sync-claudinite.sh) — the legacy per-session sync,
     deleted from the canon (members' tracked copies are deleted by the flip itself).
  2. Bootstrap's **transition appendix** (pre-flip maintenance shapes) and the baselining
     worker's pre-flip branch.
  3. The **`vendored-mount-flip` note** (its job is done when no pre-flip member exists).
  4. The **`mount-folder-relocation` note** and the sync-hook path chain it governs.
  5. The four **engine-restructure transition shims** at the old fetched-tree paths —
     `checks/stop-hook.mjs`, `checks/pretooluse-guard.mjs`, `mount/session-start.sh`,
     `packs/env.mjs` — together with the **`engine-restructure` note** that heals flipped
     members' settings (#385).
  6. The **legacy owned-roots** in `engine/skill_loader/mount-skills.mjs` (the pre-#385 mount
     shapes: the flat `.claudinite/skills/`, the standalone `.claudinite/shared/skills/`, and
     the corpus `skills/` root — #383).
  7. The **legacy path regexes** in `routines/fleet/signals.mjs` (`checks/`, `skills/`,
     `mount/`, root `sync-claudinite.sh` — superseded by `engine/`).
  8. [consumer-safe-changes.md](../../consumer-safe-changes.md) rewritten to the new, much
     smaller channel model (tracked-vendor commit + notes; the instant `@main` and session-sync
     channels are gone).
  Deliberately **not** phase-3 items: the `maintenance-delivery` value aliases
  (`push`/`auto`/`pr` — permanent, their note self-retires) and the `local_packs/` bare-id
  tolerance (same pattern).

## The vendor-set contract ([vendor.mjs](compute-vendor-set.mjs))

`computeVendorSet(declaredEntries)` → `{ files, errors }`, computed against the
canon tree the module ships in; the writer materializes `files` under `SHARED_SUBDIR`
(exported; defined beside `LOCAL_PACKS_SUBDIR` in the packs registry). Structural throughout:
`ENGINE_DIR_ROOTS` walks (tests and root-docs excluded), `MACHINERY_ROOTS` top-level `.mjs`,
resolved canon packs' directories (each pack's bundled skills riding its own tree — #385) —
never a per-file list. Declared ids that
name no canon pack (a consumer's local packs, or a typo the runner's settings validation
already flags) are skipped without error. The computed set is verified
**import-closed** before it is returned: a vendored module whose relative
import resolves outside the set (or to nothing) is reported in `errors`, so
convergence aborts before any write instead of a flipped member crashing on a
missing module — the guard is judged against the same engine-surface
definitions the `pack-independence` barrier confines pack imports to (one home,
`engine/checks/helpers/module-imports.mjs`).
