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

This is the same instinct the corpus already applies to itself: packs — and the skills bundled
inside them — are discovered by *scanning the tree*, not by a hand-maintained list
([engine/pack_loader/pack-registry.mjs](engine/pack_loader/pack-registry.mjs)); the mechanism is fixed, the content is open. New
content drops in a directory; new mechanism is a deliberate change to the engine.

## What is core (the engine)

Core is the small, closed set of machinery that runs, discovers, and schedules content. Touch it
only to extend the *mechanism*, never to add one project's rule or task:

| Engine piece | Home | What it is |
|---|---|---|
| Checks runner + hooks | [`checks/`](engine/checks/README.md) | the dependency-free runner, its lib, the Stop hook, the PreToolUse guard — runs the packs' checks; owns no rule itself |
| Pack discovery + prose injection | `engine/pack_loader/pack-registry.mjs`, `engine/pack_loader/inject-pack-prose.mjs` | structural scan of `packs/*/pack.mjs`; SessionStart injection of active packs' prose |
| Skill mounting | `engine/pack_loader/mount-skills.mjs` | per-session symlink of the active packs' bundled-skill union (`<pack>/skills/<name>/`) |
| Adoption interviews | `packs/grow_with_claudinite/skills/adopt-claudinite/interview.mjs` | the gap computation (a pack's declared questions minus the entry's stored answers) and the SessionStart nudge; owns no question itself — bundled in the adoption skill, resolved fail-soft by the engine |
| Baseline-migration mechanism | [`migrations/`](migrations/README.md) | the read-side resolver, write-side rename, and fleet telemetry that auto-retires a relocation once every consumer has moved |
| The run_daily planner | [`routines/fleet/`](routines/fleet/DESIGN.md) | goes over the reachable repos, assembles each one's due tasks from its active packs, masks full-sweep, isolates a throwing gate, emits the plan; pack-agnostic, owns no task, depends on no pack |
| The orchestrator | [`routines/auto-all-repos-maintenance.md`](routines/auto-all-repos-maintenance.md) | the single scheduled entry point — runs the planner over the accessible fleet, reads the plan, fans out the units |
| Bootstrap / baselining | [`bootstrap.md`](bootstrap.md), `engine/checks/check_the_world.mjs --init` | adoption and the idempotent per-repo re-run |

**The test for "is this core?"** — would *every* pack's content stop working without it? The
planner, the runner, the migration mechanism, the orchestrator loop all pass; a lint for one
technology, a nightly release task, a naming rule all fail. Two responsibilities are core *by
ownership* even though they run as pack tasks: **baselining** (the baseline pack's daily task) and the
**daily-run** itself are Claudinite's job, not a pack's — the pack is only the delivery slot.

## What a pack contributes

A pack is a directory `packs/<name>/pack.mjs` exporting contribution slots (any subset
— a pack may carry only prose, only a task, only checks):

| Slot | Field | Carries |
|---|---|---|
| **Prose** | `prose: 'RULES.md'` | always-relevant-to-a-project guidance, injected into context when the pack is active |
| **Checks** | `rules: [...]` | deterministic conformance rules run at every Stop and in CI |
| **Skills** | `<pack>/skills/<name>/` | activity-scoped procedures bundled in the pack's own tree, mounted wherever the pack is declared |
| **Daily tasks** | `run_daily: [...]` | `(gate, worker)` maintenance units the planner picks up — each declares `full_sweep_supported` and its `smarts` tier |
| **Questions** | `questions: [...]` | mandatory adoption-interview questions; the owner's answers live verbatim on the project's pack entry ([packs/README.md](packs/README.md#adoption-interview-questions)) |
| **Contributed config** | `contributes: { <pack>: ... }` | configuration addressed to another (required) pack — a fixed folder-barrier is the canonical case. The target pack interprets its active contributors' data via its own `contributedRules(activePacks)` seam, returning first-class rules; the runner wires the two together, so composition is declaration + data, never a cross-pack import |

**Packs are independent.** A pack's code imports only its **own** files and the engine surface
(`checks/`, `mount/`, the machinery `.mjs` at the `packs/`/`skills/` roots) — never another
pack's code, and never a canon-internal tree (`migrations/`, `routines/`): the vendor set ships
a pack only when declared and ships no canon-internal tree at all, so such an import crashes
every consumer that vendors the importer without its target. A pack that wants another pack's
*abilities* declares the dependency (`requires`) and passes **configuration**; a helper both
sides need moves into `checks/lib`. Enforced canon-side as **barriers configuration, never
bespoke checking code**: the `pack-independence` barrier is contributed as manifest data by the
canon home's own curation local pack (`.claudinite/local_packs/canon-curation/` — a home-repo
duty, since the `packs/` tree it polices exists only here), with the vendor writer's coherence
guard holding the same invariant at vendoring time on consumers' behalf.

Activation is the project's declaration in `.claudinite-checks.json` — **no pack runs undeclared,
the baseline included.** A technology pack carries a `detect` fingerprint so `--init` seeds it into a
fresh declaration when the technology is present; the marker only *suspects* a pack is wanted,
never forcing or forbidding its declaration afterward. A declared-by-policy pack (the baseline and
the default-on maintenance packs) sets `detect: null` and is seeded by `--init`
and/or a one-time migration.

### Two homes for a pack: the canon, and a project's own `local_packs/`

A pack contributes the same slots from either of two homes, and the engine runs both the
same way:

- **A canon pack** — `packs/<name>/` in this repo, mounted read-only into every consumer. It is
  *portable*: written as if no one project existed, shared by every project that declares it.
- **A local pack** — `.claudinite/local_packs/<name>/` in a **consumer's own tree**, tracked
  project content the consumer authors and commits. It is *project-specific*: the working style,
  values, checks, and skills that don't generalize past this one repo — the project's
  **normalized capture surface** (what used to sprawl as always-loaded `CLAUDE.md`/`dev/procedures`
  prose). `discoverPacks` scans both roots; a local pack carries its own `dir`, is `local: true`,
  may not shadow a canon id, and is declared by its namespaced token `local_packs/<name>`
  ([packs/README.md](packs/README.md#local-packs--a-projects-own-packs)). Prose injection, the Stop/CI checks, skill mounting, and the fleet's
  nightly `run_daily` scheduling treat a declared local pack exactly like a canon one — the planner
  reads a member's local-pack daily descriptors by default
  ([packs/README.md](packs/README.md)).

The split is the same **portable-vs-specific** line the growth lifecycle already draws: a rule true
beyond this project belongs in a canon pack (proposed by PR, or promoted up by the growth routine);
a rule specific to this project belongs in its local pack. Neither is ever "hardcode it into the
engine."

## Where a new feature goes — the routing

Ask what *kind* of thing you're adding; each kind has exactly one home, and none of them is core:

1. **A new rule or practice** → the [promotion ladder](engine/checks/DESIGN.md) (platform setting →
   PreToolUse hook → post-hoc check → skill → prose) picks the mechanism; it lands in a pack (or
   a skill that pack requires). *Which* pack follows the portable-vs-specific split: a portable rule
   → a canon pack; a rule specific to one project → that project's own `local_packs/` pack. The
   ladder owns *which* mechanism — this doc only says the answer is never "hardcode it into the
   engine," and (for a project-specific rule) never "always-loaded `CLAUDE.md` prose" when a local
   pack's check or skill can carry it.
2. **A new technology's conventions** → a new technology pack, with a `detect` fingerprint so
   `--init` seeds it when the technology is present (declaring it stays the project's call).
3. **A new scheduled maintenance behavior** → a `run_daily` task (a `(gate, worker)` pair) on the
   owning pack. The planner assembles it automatically — **no edit to the orchestrator or the
   planner.** This is the load-bearing case: "add a nightly job" must never become "add a routine
   to `routines/`."
4. **A new project-class playbook** → a project-class pack.
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
text-sweep skill; the discipline is: a relocation that
leaves the source behind isn't done.

---

Related: the corpus map lives in [README.md](README.md) (there is no agent-facing corpus index — #385); the mechanism
promotion ladder is in [engine/checks/DESIGN.md](engine/checks/DESIGN.md); keeping a canon change from hurting
consumers is [consumer-safe-changes.md](consumer-safe-changes.md).
