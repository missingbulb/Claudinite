# Extending Claudinite — the core/pack boundary and where a feature goes

Before adding *anything* to this repo, decide which of two layers it belongs to. Getting this
wrong is the recurring failure mode — a rule, a technology's conventions, or a nightly task
wired straight into the engine instead of contributed as pack content, where every consumer then
pays for it whether or not they need it.

## The one principle

> **Core is the engine that runs pack-contributed content. A feature is core only if it *is* the
> engine.** Everything a project could plausibly not need — a rule, a technology's gotchas, a
> maintenance task, a project-class playbook — is pack content, discovered structurally and
> activated by declaration. If you can't say "this is machinery every pack relies on," it isn't
> core.

This is the same instinct the corpus already applies to itself: packs and skills are discovered
by *scanning the tree*, not by a hand-maintained list ([packs/registry.mjs](packs/registry.mjs),
[skills/registry.mjs](skills/registry.mjs)); the mechanism is fixed, the content is open. New
content drops in a directory; new mechanism is a deliberate change to the engine.

## What is core (the engine)

Core is the small, closed set of machinery that runs, discovers, and schedules content. Touch it
only to extend the *mechanism*, never to add one project's rule or task:

| Engine piece | Home | What it is |
|---|---|---|
| Checks runner + hooks | [`checks/`](checks/README.md) | the dependency-free runner, its lib, the Stop hook, the PreToolUse guard — runs the packs' checks; owns no rule itself |
| Pack discovery + prose injection | `packs/registry.mjs`, `packs/load-active-prose.mjs` | structural scan of `packs/*/pack.mjs`; SessionStart injection of active packs' prose |
| Skill discovery + mounting | `skills/registry.mjs`, `skills/mount-skills.mjs` | structural scan; per-session symlink of the active packs' skill union |
| Baseline-migration mechanism | [`migrations/`](migrations/README.md) | the read-side resolver, write-side rename, and fleet telemetry that auto-retires a relocation once every consumer has moved |
| The run_daily planner | [`routines/fleet/`](routines/fleet/DESIGN.md) | assembles each repo's due tasks from its active packs, masks full-sweep, isolates a throwing gate, emits `plan.json`; owns no task |
| The orchestrator | [`routines/auto-all-repos-maintenance.md`](routines/auto-all-repos-maintenance.md) | the single scheduled entry point — dispatches the census, reads the plan, fans out the units |
| Bootstrap / baselining | [`bootstrap.md`](bootstrap.md), `checks/run.mjs --init` | adoption and the idempotent per-repo re-run |

**The test for "is this core?"** — would *every* pack's content stop working without it? The
planner, the runner, the migration mechanism, the orchestrator loop all pass; a lint for one
technology, a nightly release task, a naming rule all fail. Two responsibilities are core *by
ownership* even though they run as pack tasks: **baselining** (the `basics` daily task) and the
**daily-run** itself are Claudinite's job, not a pack's — the pack is only the delivery slot.

## What a pack contributes

A pack is a directory `packs/<name>/pack.mjs` exporting up to four contribution slots (any subset
— a pack may carry only prose, only a task, only checks):

| Slot | Field | Carries |
|---|---|---|
| **Prose** | `prose: 'RULES.md'` | always-relevant-to-a-project guidance, injected into context when the pack is active |
| **Checks** | `rules: [...]` | deterministic conformance rules run at every Stop and in CI |
| **Skills** | `skills: [...]` | activity-scoped procedures mounted wherever the pack is declared |
| **Daily tasks** | `run_daily: [...]` | `(gate, worker)` maintenance units the planner picks up — each declares `full_sweep_supported` and its `smarts` tier |

Activation is the project's declaration in `.claudinite-checks.json` — **no pack runs undeclared,
`basics` included.** A technology pack carries a `detect` fingerprint so the drift-guard tells a
repo to declare it once the technology appears; a declared-by-policy pack (`basics`,
`grow_with_claudinite`, `tidy-repo`, `sheepdog`) sets `detect: null` and is seeded by `--init`
and/or a one-time migration.

## Where a new feature goes — the routing

Ask what *kind* of thing you're adding; each kind has exactly one home, and none of them is core:

1. **A new rule or practice** → the [promotion ladder](checks/DESIGN.md) (platform setting →
   PreToolUse hook → post-hoc check → skill → prose) picks the mechanism; it lands in a pack (or
   a skill that pack requires). The ladder owns *which* mechanism — this doc only says the answer
   is never "hardcode it into the engine."
2. **A new technology's conventions** → a new technology pack, with a `detect` fingerprint so it
   self-declares when the technology shows up.
3. **A new scheduled maintenance behavior** → a `run_daily` task (a `(gate, worker)` pair) on the
   owning pack. The planner assembles it automatically — **no edit to the orchestrator or the
   planner.** This is the load-bearing case: "add a nightly job" must never become "add a routine
   to `routines/`."
4. **A new project-class playbook** → a project-class pack (e.g. `research-project`,
   `spec-driven-product`).
5. **Extending the engine itself** — a new signal the planner computes, a new discovery rule, a
   new migration capability, a change to the orchestrator loop — *is* the rare core change. Do it
   deliberately, and expect it to serve every pack, not one.

If a proposed change is a new file under `routines/`, `checks/` (beyond the runner/lib), or a new
branch in the planner *for one task's sake*, stop: it almost certainly belongs in a pack.

## Relocating into a pack: retire the old home

Most "make this a pack feature" work is a **move** — a rule out of always-loaded prose and into a
check, a routine into a pack's `run_daily`, a doc into a skill. A move isn't finished when the new
home works; it's finished when the **old home is gone**. Leaving the original as a tombstone stub
(`# retired — see the pack`) creates two homes for one thing, which drifts and misleads. Delete
the emptied source in the same change, fix every inbound reference, and let the conformance checks
(`reference-integrity`, `catalog-completeness`) confirm nothing dangles. The mechanics live in the
[repo-text-sweeps skill](skills/repo-text-sweeps/SKILL.md); the discipline is: a relocation that
leaves the source behind isn't done.

---

Related: the corpus map and the two content homes are in [CLAUDE.md](CLAUDE.md); the mechanism
promotion ladder is in [checks/DESIGN.md](checks/DESIGN.md); keeping a canon change from hurting
consumers is [consumer-safe-changes.md](consumer-safe-changes.md).
