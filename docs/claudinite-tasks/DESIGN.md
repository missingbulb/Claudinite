# claudinite-tasks — the task execution surface as a pack

The end state: the engine is **pack distribution only**, and everything that schedules, queues,
executes and delivers task work is a canon pack, `packs/claudinite-tasks/`, activated by
declaration like any other.

## The boundary

**The engine keeps** what every pack relies on to *exist* in a repo: pack discovery and loading
(`engine/pack_loader/`), the checks runner and hooks (`engine/checks/`, `engine/hooks/`), the
migration mechanism (`engine/migrations/`), settings/version/self-test, and the distribution half
of the wiring converge — settings hooks, the rules index, `.gitattributes`, the badge row. The
test from `extending.md` still decides membership: would every pack's content stop working
without it?

**`packs/claudinite-tasks/` owns** everything whose subject is task work:

- the queue — planner, executor, continuation, drain, workflow-failure escalation, leases,
  readiness, janitor rules, work-item and dispatch vocabulary;
- the task contract, signals, calendar/anchor math, model map, run records, code-work;
- the delivery lane — `land-pr`, `deliver-generated` — and the GitHub REST helpers and tracker
  they ride on;
- the two workflow stubs and the operational documents (`executor.md`, `deliver-pr.md`,
  `queue/instructions.md`);
- the scheduling half of the wiring converge (workflow content, hashed cron, anchor hours,
  routine endpoints);
- `implement-request`, as an ordinary task of this pack rather than an engine built-in — the
  `model_from_request` fence becomes "only this pack's task declares it". Item titles minted
  under the legacy `engine/implement-request` id decode forever (the stored-data rename rule);
  new items carry the pack's id.

Task discovery stays structural and pack-agnostic: this pack's scheduler scans every *declared*
pack's `tasks/<name>/` directories, exactly as the engine's did. The `tasks/` contribution slot
is now interpreted by this pack — the same composition seam as `barriers`' contributed rules:
declaration plus data, never a cross-pack import.

Queue meta-machinery lives here rather than where it historically landed: `task-janitor`
(sweeps the queue), `usage-fold` (folds the queue's own run records and outcomes), and the
task-declaration checks (`task-declaration-shape`, `task-code-work-env`) are this pack's tasks
and checks.

## `shared-code/` — the published import surface

`packs/claudinite-tasks/shared-code/*` is the pack's deliberate export surface: the one place in
the corpus another pack's code may import from a pack it `requires`. Enforced as barriers
configuration — everything of this pack *outside* `shared-code/` stays off-limits to other packs,
and no other pack gains an equivalent surface by existing.

What it carries is what external consumers demonstrably need:

- the work-item/dispatch **title grammar** (parse/render — a work item is a GitHub issue and its
  title is its identity);
- the **outcome/status decode** over item labels, including every legacy spelling;
- the **anchor math** (`periodMs`, `mostRecentAnchor`, `nextAnchor`);
- the **delivery helpers** (`deliverGenerated`, `landPr`) and the **GitHub client/REST helpers**
  (`makeGh`, labels/comments/issues, the tracker), which any pack's worker uses to land output;
- task-declaration validation, which other packs' tests exercise.

Consumers: `claudinite-dashboard` (renders the queue's state; stays its own pack and declares
`requires: ['claudinite-tasks']`), and any pack whose tasks deliver PRs or generated files.

## Updates live in claudinite-lifecycle

The versioned update flows (engine update, pack update, install) are the `update` task's own
machinery and move into `packs/claudinite-lifecycle/`. They still execute from the freshly
fetched canon tree, so the flow code a member runs is always current; the old `updates/*` module
paths remain as callable shims until no fielded vendored worker names them (the same rule that
already governs `updates/*` exports).

A repo that declares `claudinite-lifecycle` but not `claudinite-tasks` has no queue, so its
update task never runs: **updates are opt-in via the tasks pack**. The recovery and manual lane
is a human session running the update or adopt-pack skills — a member with a state it likes
keeps it, like any package manager without forced auto-update.

## Workflows: written once, then static

The two member workflow files (`claudinite-scheduler.yml`, `claudinite-executor.yml`) are static
after adoption:

- secrets travel as one fixed `CLAUDINITE_SECRETS: ${{ toJSON(secrets) }}` line, so content no
  longer depends on the task set;
- the per-repo cron minute and anchor hours are written once, at adoption;
- `run:` lines name **mount pack paths** (`.claudinite/shared/packs/claudinite-tasks/…`), and
  everything behind those paths converges nightly — an engine or pack release never edits the
  YAML again.

Consequently **no update flow touches `.github/workflows/`**, and the `pending-workflows/`
withhold lane does not exist: a structural change to the YAML itself (permissions, an actions
version bump) is an explicit, human-merged fleet PR event, not a lane the machinery must carry.
Adoption of `claudinite-tasks` (the adopt-pack skill, or bootstrap when the pack is declared at
init) scaffolds the two files and the CCR routine endpoints; the routines' stored prompts point
at the pack's operational documents in the mount.

Members' `claudinite-ci.yml` is untouched by any of this: it is seeded once by bootstrap when no
existing workflow runs the world sweep, is member-owned from then on, and belongs to the checks
surface.

## Alternatives considered

- **Status quo (scheduler in the engine).** 8,106 of core's ~15,600 lines are scheduling; every
  consumer vendors machinery only scheduled repos use, engine releases imply workflow-path churn,
  and "core" stops meaning distribution. Rejected — the size and the boundary rot are the
  problem this design exists to fix.
- **Fold the queue into claudinite-lifecycle.** Removes the updates↔queue seam entirely, but
  couples "being a member" with "running scheduled work" — a repo could not take the lifecycle
  without the queue, and the tasks surface stops being independent. Rejected for a standalone
  pack plus lifecycle-owned update flows.
- **Fold the dashboard into claudinite-tasks.** Removes the last cross-pack read, but the
  dashboard is a distinct capability a repo chooses separately. Rejected in favor of the
  `shared-code/` surface.
- **Wire vocabulary as duplicated data with drift guards.** Keeps packs fully import-independent,
  but the anchor math is logic rather than data, and every consumer copy is a drift liability.
  Rejected in favor of one published surface.
- **Delivery helpers as an engine residue.** Keeps `land-pr`/`deliver-generated` importable
  without a sanctioned crossing, but leaves task-lane capability in an engine meant to be
  distribution only. Rejected; they are `shared-code/`.
- **A second engine-owned scheduler kept for updates only.** Guarantees a delivery lane even
  when the tasks pack is broken, at the cost of two schedulers. Rejected: the canary rehearsal
  gates releases, and the recovery path is a human session — acceptable for an opt-in updater.
