# Baselining as code — the deterministic self-refresh, agentic only for flagged notes

> **Status: proposal.** Builds directly on the vendored-mount design
> ([../../vendoring/DESIGN.md](../../vendoring/DESIGN.md)) and per-project scheduling
> ([../per-project-scheduling/DESIGN.md](../per-project-scheduling/DESIGN.md), which
> already lists baselining as `model: sonnet`). The thesis: baselining's mount
> refresh is deterministic and **already scripted** — only a migration note that
> must adapt consumer-authored content needs a model. This record proposes driving
> baselining's `model` down to `none` (the `smarts`-descent doctrine's stated goal),
> spawning an agent **only** when a pending note declares itself agentic.

## The question

The nightly "rebasing" step — the corpus calls it **baselining**
([packs/basics/tasks/baselining/](../../packs/basics/tasks/baselining/)) — reads as
if it shouldn't be agentic. Its core is exactly "delete `.claudinite/shared/**`,
write the new engine + declared packs, advance the stamp." That is not a judgment
call; it is a converge-to-head function, and it is **already written as a
dependency-free Node script**:
[vendoring/apply-vendor-set.mjs](../../vendoring/apply-vendor-set.mjs) rebuilds
`shared/` from the vendor set and stamps it, with the #328 anti-rewind guards
built in. Yet the task ships as `model: sonnet`, so every night it runs on a
capable model over MCP, in prose. This record asks: what, precisely, in baselining
requires a model — and can everything else run as a script?

## What baselining does tonight, classified

The `sonnet` worker ([task.md](../../packs/basics/tasks/baselining/task.md)) does
seven things. Six are mechanical; the classification is the whole argument:

| Step | Deterministic? | How |
|---|---|---|
| **Verify canon checkout is at remote head** | ✅ | `git rev-parse HEAD` vs the Context's sha — already the anti-rewind guard in [apply-vendor-set.mjs](../../vendoring/apply-vendor-set.mjs) |
| **Apply mechanical migration ops** (aliases, materializations, rewrites) | ✅ | [migrations/apply.mjs](../../migrations/apply.mjs) — already a standalone, idempotent CLI |
| **Declaration normalization** (`local_packs/<id>`, bare → `local/<id>`) | ✅ | pure string rewrite via `declTokenFor` ([engine/pack_loader/pack-registry.mjs](../../engine/pack_loader/pack-registry.mjs)) |
| **Converge `.claudinite/shared/` + advance stamp** | ✅ | [apply-vendor-set.mjs](../../vendoring/apply-vendor-set.mjs) — `rmSync(sharedDir)` then rewrite the set, one function |
| **Converge fresh-path wiring** (settings hooks, scheduler stub, dispatch labels) | ✅ *(needs a new script)* | an enumerable, merge-without-clobber set — see [§ What this needs](#what-this-needs) |
| **Apply an agentic migration note** | ❌ | adapt consumer-authored `local/packs/` to a changed engine contract — the one irreducibly agentic case |
| **Align: run checks, fix findings** | ❌ *(but avoidable)* | checks emit **prose** `fix` remedies, not code transforms ([engine/checks/README.md](../../engine/checks/README.md) l.153) — see below |

**The alignment leg is agentic today but should not fix at all.** A check `fix` is
"the exact remedy" as a string an agent reads and enacts — not an executable
transform, so applying one is a model act. But the doctrine already says baselining
must "never [edit] more than a failing check's own remedy" and route "a finding
needing judgment [to] an issue, not an edit." Critically, the check findings
baselining *could* mechanically fix are all about the **mount and wiring** — which
converge + converge-wiring + declaration-normalization now repair deterministically
and completely. What's left after those run is a finding against the member's **own
authored code** — precisely the judgment case the doctrine says to *file as an
issue, not fix*. So the deterministic core runs the checks and **files residual
findings as one roll-up issue, fixing none** (filing is mechanical: the check output
is the content). No model needed. See the load-bearing assumption in
[§ What this needs](#what-this-needs).

## The one thing that actually needs a model

**A migration note that carries member-side agentic instructions.** A migration
record ([migrations/README.md](../../migrations/README.md)) declares mechanical ops
that [apply.mjs](../../migrations/apply.mjs) runs — *and*, when the canon changes a
contract the consumer's own code depends on, a **brief agentic note** for adapting
that code. The live example is
[2026-07-19-pack-independence.mjs](../../migrations/active_migrations/2026-07-19-pack-independence.mjs):
"Member-side there are no mechanical ops… The AGENTIC note: if a member's own local
packs composed a barrier by importing the shared engine, convert each to the
contribution shape." No script can do that — it edits bespoke consumer content
against a described contract. **This, and only this, is baselining's agentic phase.**

Today that guidance lives as **prose in the record's comments** — there is no
machine-readable flag telling the deterministic pass "this note has agentic work."
Adding one is the enabling change (below).

## The model

Split baselining into a deterministic core (`model: none`) and a rare agentic
escalation, exactly as the `smarts`-descent doctrine prescribes — *"`none` — code
only — is the best version of any task; every tier down is a win, in cost and in
reliability"* ([routines/fleet/DESIGN.md](../../routines/fleet/DESIGN.md)).

### 1. The deterministic core (`model: none`) — one transactional pipeline

Run, against the member working tree, sourcing head from the in-session canon
checkout:

1. **Verify** the canon checkout is at the remote default-branch head (the
   anti-rewind guard). Mismatch ⇒ this run fails, writes nothing.
2. **Mechanical migration ops** — [apply.mjs](../../migrations/apply.mjs) over notes
   dated on/after the stamp's day (same-day inclusive, #330).
3. **Declaration normalization** — legacy/bare local-pack tokens → `local/<id>`.
4. **Converge `shared/` + advance the stamp** — [apply-vendor-set.mjs](../../vendoring/apply-vendor-set.mjs).
5. **Converge wiring** — `converge-wiring.mjs` (new): ensure the settings hook
   registrations, delete the retired `@…/CLAUDE.md` import line, re-converge
   `claudinite-scheduler.yml` to the vendored stub preserving the repo-hashed cron
   minute, and idempotently create the four dispatch labels.
6. **Run the checks, file residual findings as one issue** — fixing none.

Steps 2–5 land as **one commit** on `claudinite/maintenance`, honoring
`maintenance.delivery` (arm auto-merge, or leave for review). A repo already at head
produces no commit — idempotent by construction.

`model: none` + `outcome: merged-pr` is fully consistent with the task taxonomy:
`migrations-retire` is already `none` + `open-pr` (a `none` task that opens a PR),
and `store-release` is already `none` doing real Action work. Baselining arming the
maintenance PR is the same established pattern — the `model` (no agent) and `outcome`
(write ceiling) fields are orthogonal.

### 2. The agentic escalation — dispatched only when a note demands it

When step 2 encounters a pending note **flagged agentic**, the core applies every
note's *mechanical* ops and the mount converge, then — instead of advancing the
stamp past the agentic note — files a `ready-for-agent` dispatch issue for a
companion task `baselining-adapt`, at the note's declared model, scoped to that note
and this repo. The executor runs it; the agent adapts the consumer's `local/packs/`
content per the note and advances the stamp in its own commit. The common night —
no agentic note pending — spawns no agent at all.

### The stamp/agentic-note coupling rule (the one correctness point)

The stamp gates which notes still apply, so it must never advance past a note whose
ops are not fully done (#329). Therefore: **the deterministic core advances the stamp
only when every pending note is fully mechanical.** If any pending note is agentic,
the core commits the mechanical + converge work with the stamp held **at the day
before the earliest pending agentic note**, and the `baselining-adapt` follow-up
advances it once the adaptation lands. Notes are idempotent, so the mechanical ops
the core re-applies next night (until the agentic one clears) are safe.

## Execution host — why the executor, not the scheduler Action

The deterministic core still needs the **fresh canon tree** — to converge to head
and to read the migration notes — and this is the binding constraint on where it
runs:

- **Not the scheduler Action.** A `model: none` worker normally runs inline in the
  scheduler Action, but a consumer's default Actions `GITHUB_TOKEN` is scoped to its
  own repo and **cannot read the canon**. The design deliberately withholds a
  cross-repo PAT from consumers (per-project-scheduling Risk table: *"consumers never
  need it"*). So the member's scheduler cannot fetch the canon — this is the real
  reason baselining was never a scheduler-inline `none` task.
- **The executor session.** The label-fired executor **already carries a read-only
  canon checkout in its sources** (per-project-scheduling §5, provisioned by CCR, no
  repo secret) — *"which is what lets the per-repo baselining task run the canon's
  vendoring script directly."* The canon is present with no consumer credential.

So baselining runs in the executor. To keep it truly `model: none`, extend the
executor with a **code-dispatch path**: a `none` task that needs the canon is
dispatched to the executor (which has it) and its worker `.mjs` is run **inline in
the executor session**, pushing via MCP — the same shape the executor already uses
for `validate-dispatch.mjs` / `verify-outcome.mjs`, not a spawned subagent. The
scheduler keeps running canon-free `none` tasks inline as today.

> **Pragmatic interim:** if the executor code-dispatch extension is deferred, ship
> the deterministic core as `model: haiku` first — the agent is a pure script-runner
> (run the pipeline, push the diff), exercising no judgment, and the escalation still
> bumps only the agentic-note run to `sonnet`/`opus`. `none`-in-executor is the
> principled end state; `haiku` captures most of the win with zero mechanism change.

## What this needs

Three pieces of new work, plus one assumption to validate:

1. **`converge-wiring.mjs`** — the fresh-path wiring convergence as an idempotent
   script. The wiring is a **fixed, enumerable set** (bootstrap Part 6): specific
   settings-hook entries to ensure-present, one import line to delete, the scheduler
   stub to copy with the one repo-specific minute preserved, four labels to create.
   "Merge without clobbering" is a defined JSON set-union on known keys — mechanical,
   not judgment. This is the main new engineering; it is also a general win (bootstrap
   stops being prose the nightly re-enacts).
2. **A machine-readable `agentic` flag on migration records** — e.g.
   `agentic: { model: 'sonnet', instructions: 'task.md-relative or inline' }` — so the
   deterministic pass detects "this note needs an agent" in code instead of a human
   reading the comment. `apply.mjs` already ignores unknown fields; this is additive.
3. **The executor code-dispatch path** (or accept the `haiku` interim).

**Load-bearing assumption to validate first:** enumerate every check baselining
currently auto-fixes in the wild and confirm each is subsumed by
converge / converge-wiring / declaration-normalization — i.e. that no *mechanical*
fix survives that isn't a mount/wiring/declaration repair. If one does, either fold
its transform into the relevant converge script or accept it becoming a filed issue.
This is a one-pass audit against the live pack check suite before flipping the model.

## What this retires and simplifies

- **The `sonnet` baselining worker for the common night** — the frequent case (a
  routine canon bump, no agentic note) becomes zero model tokens.
- **The MCP trailing-delete dance.** Convergence pruning a dropped file, done over
  MCP, can't ride a `push_files` commit and must follow as separate `delete_file`
  commits (#329). A local script committing a tree carries deletions **natively** —
  the whole two-phase delete caveat disappears wherever the core runs against a real
  working tree.
- **The per-night baselining dispatch issue** — the common night files nothing; only
  an agentic note or a residual check finding surfaces an issue.

## Tradeoffs and risks

| Risk | Mitigation |
|---|---|
| A behavior change: baselining stops auto-fixing member-code check findings, filing them instead | This is the doctrine's own stance (judgment → issue, never a silent nightly edit); the mount/wiring fixes it used to make are now deterministic, so nothing that *should* be auto-fixed regresses. Validate via the audit above. |
| `converge-wiring.mjs` drifts from `bootstrap.md` | Make bootstrap Part 6 *call* the script — one source of truth for wiring, not two. |
| A note author forgets the `agentic` flag → the core silently skips agentic work and over-advances the stamp | A conformance check: a record whose `summary`/comments describe member-side adaptation but carries no `agentic` flag fails canon CI. |
| The executor code-dispatch path is more mechanism | The `haiku` interim needs none of it and captures most of the cost/reliability win. |

## Alternatives considered

- **Keep it `sonnet`, just have the worker call the scripts.** Rejected as the end
  state: it still pays a capable-model turn every night to run deterministic code,
  exactly the cost the `smarts`-descent doctrine exists to remove. It is, however,
  the trivial first step (the `haiku` interim is its cheaper form).
- **Run baselining centrally from the canon's scheduler** (which holds the fleet
  PAT, so the canon is trivially readable). Rejected: it resurrects the central fleet
  pass the per-project design just dismantled, reintroducing the single point whose
  failure sinks everyone's refresh.
- **Vendor enough of the canon into each member to self-refresh offline.** Impossible
  in principle: converging *to head* requires the fresh head; a stale local copy can
  only converge to yesterday. The canon must be reachable, and the executor's
  CCR-provisioned checkout is the sanctioned reach.

## Phased approach

1. **Audit** the check-fix subsumption assumption; enumerate `converge-wiring`'s
   exact op set from bootstrap Part 6.
2. **Write `converge-wiring.mjs`** + tests; have bootstrap Part 6 call it.
3. **Add the `agentic` flag** to the migration record schema + its conformance check;
   move `pack-independence`'s prose guidance into the structured field as the first
   user.
4. **Flip baselining to `haiku`** with a thin script-runner `task.md` (the interim) —
   soak on the pilot repo (GCEC), verifying one real canon bump converges with no
   judgment and one agentic-note night escalates correctly.
5. **Add the executor code-dispatch path** and flip baselining to `model: none`.
6. **Verify** a full night: common repos refresh as pure code (no dispatch issue), an
   agentic-note repo escalates a single scoped `baselining-adapt`, the stamp coupling
   holds, deletions ride the commit natively.
