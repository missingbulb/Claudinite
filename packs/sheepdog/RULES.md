# sheepdog — the fleet enforcer marker

Declaring this pack marks a repo as the **fleet enforcer**: the one repo that covers and maintains
every repo under an owner. It's opt-in — a dedicated `sheepdog` repo declares it (it is **not** seeded
by `--init`).

It contributes the pieces only a fleet enforcer needs — three **cross-repo sweeps** — plus their config
schema and the scheduled tasks that run them. The rest of the machinery — running the daily-run (the
orchestrator), the task engine (`engine/scheduler/`), scheduling — is Claudinite **core**, because
baselining and the daily-run are Claudinite's own responsibility, not the pack's.

**Three sweeps, three questions** — separate, because they close on unrelated conditions. The
**census** ([check-fleet-coverage.mjs](tasks/fleet-census/check-fleet-coverage.mjs)) asks *is this repo a
member* and converges `fleet-adoption` issues. The **freshness sweep**
([check-fleet-freshness.mjs](tasks/fleet-freshness/check-fleet-freshness.mjs)) takes coverage as given, asks *is that
membership still meaning anything*, and converges `fleet-drift` issues. The second exists because
per-project scheduling made every member maintain itself and removed the last outside look at one:
self-maintenance cannot detect its own absence. The **usage sweep**
([aggregate-fleet-usage.mjs](tasks/fleet-usage/aggregate-fleet-usage.mjs)) asks *what does the fleet
actually use* and writes `usage-fleet.GENERATED.json` — a file, not issues, because it reports a
measurement rather than a condition to converge. It exists because a member folds its own skill-usage
numbers and can therefore only say whether a skill loads *there*; whether a skill earns its place at
all is fleet-shaped, and nothing inside a member can see it.

**One manual lever, not a fourth sweep** — [force-fleet-baseline.mjs](fleet-baseline/force-fleet-baseline.mjs)
fires every covered member's own `claudinite-scheduler.yml` with `overrides: FORCE_TASKS=baselining`,
which is the same button the owner would press in that repo's Actions tab, pressed across the fleet in
one run. It is a **dispatcher, not a maintainer**: each member converges its own mount, with its own
token, under its own delivery policy, and this writes nothing to any member — one queued Actions run
each, and no commit, issue or comment. Under per-project scheduling the fleet needs no push in the
ordinary case; this is for the un-ordinary ones — a canon change the fleet should pick up *now*, or the
tail of members whose next slot is hours away while someone is standing by. A forced run bypasses
baselining's precondition, so a member with nothing to do converges to a cheap no-op: over-using it is
wasteful, never unsafe. A **dormant** member is skipped and reported (it stopped its own scheduler on
purpose); `include_dormant` overrides that. Canon is skipped — its baselining self-skips — but the
enforcer repo is **not**: it is an ordinary member, and leaving it out would make the one repo the owner
is watching the one repo that did not move.

**Why that one is a workflow** — every other thing this pack does answers a recurring question, so it
is a scheduled task. Force-baseline answers none and has no cadence: it is owner-initiated, carries its
own inputs (repo filter, dry run, dormant opt-in), and starts when a human presses *Run workflow*. Its
workflow declares **`workflow_dispatch` only** — no `schedule:` — so the vendored scheduler remains the
repo's only cron and [scheduled-tasks.md](../basics/scheduled-tasks.md)'s doctrine is untouched. GitHub
reads workflows solely from a repo's own `.github/`, never from the mount, so the enforcer hosts a copy
of [stubs/workflows/fleet-baseline.yml](stubs/workflows/fleet-baseline.yml) — byte-identical, carrying
no repo-specific value.

**It arrives, and stays current, on its own** — through the
[`sheepdog-fleet-baseline`](../../migrations/active_migrations/2026-08-05-sheepdog-fleet-baseline.mjs)
record, gated on the repo **declaring this pack**, so declaring sheepdog is the whole adoption. Its
delivery takes one detour worth knowing about: the Action's `GITHUB_TOKEN` may not write under
`.github/workflows/`, so the nightly converge **withholds** the file from its own push and baselining's
**agent stage** lands it on the same maintenance branch over MCP, whose credential does hold that
permission ([#649](https://github.com/missingbulb/Claudinite/issues/649); the mechanism is
`withheldWorkflowPaths` in the baselining worker and §2b of its task.md). Nothing about that is
sheepdog-specific — the scheduler workflow itself rides the same path — and nothing about it needs a
human. Edit the pack; the copy follows.

**Where the code lives** — each sweep sits **inside its task's folder**, because only that task's
`worker.mjs` uses it; force-baseline sits in [fleet-baseline/](fleet-baseline/) beside them, because it
belongs to no task and its runner is the vendored workflow. The pack root holds just what they all
need: [fleet-api.mjs](fleet-api.mjs) (cross-repo REST primitives) and
[fleet-config.mjs](fleet-config.mjs) (the one reader of the entry `config` below).

**Config** — this repo's `.claudinite-checks.json` carries, as its `packs` entry for this pack:

```json
{ "id": "sheepdog", "config": { "owner": "missingbulb", "kind": "user", "exclude": ["owner/repo-a"],
                                "canonRepo": "missingbulb/Claudinite", "staleDays": 14 } }
```

`owner` (default: this repo's owner) is who to cover; `exclude` is the repos deliberately kept out of
the fleet (a full `owner/name` each) — a repo is kept out by adding it here. `kind: "user"` today; org
support is a later addition. `canonRepo` (default `<owner>/Claudinite`) is what a member's stamped ref
is measured against — named rather than inferred, because a ref tells you nothing about where it came
from. `staleDays` (default `14`) is how far behind is too far. Both are freshness-only and both
default, so an existing sheepdog config keeps working untouched.

**Classification** — all three sweeps are ordinary **pack tasks**, not fleet mechanisms. Their
*implementation* — an account-spanning PAT — happens to scan every repo under the owner, but their
declaration, scheduling, and lifecycle are exactly those of any pack task. None declares the
`fleet` signal nor `session_scope: fleet`; the cross-repo reach lives in the implementation, never in
how a task is wired. (The task files carry the same note.)

**How they run** — as the pack's [`fleet-census`](tasks/fleet-census/task.md) (`daily`),
[`fleet-freshness`](tasks/fleet-freshness/task.md) (`weekly`) and
[`fleet-usage`](tasks/fleet-usage/task.md) (`daily`) scheduled tasks, all `agent_model: none`, each
with its sweep as `agent_preprocessing`. The first two are `expected_outcome: none` (they open
**issues**, never a PR); the usage sweep is `merged-pr`, because its output IS a tracked file and an
auto-merging PR keeps that write inside the outcome taxonomy, lets this repo's CI gate a malformed
file, and makes the daily PR stream a browsable audit trail. Freshness is weekly because drift is
measured in days — a daily sweep would re-ask a question whose answer cannot have changed; usage is
daily because the members fold daily. There is **no coverage workflow** — preprocessing
runs Action-side inside this repo's one scheduler workflow, so the repo Actions secret is already
reachable there; each task's `required_secrets: ['FLEET_GITHUB_TOKEN']` stamps the name into that
workflow's env and is what asks the owner for it (a fine-grained PAT spanning the owner's repos:
Metadata + Contents read, Issues read/write, and Contents write on this repo for baseline-migration
retirement — freshness adds no scope). A workflow that exists only to hold a secret is redundant
([packs/basics/scheduled-tasks.md](../basics/scheduled-tasks.md)) — the force-baseline workflow above is
not that: it exists because the operation is manual, and it reads the same secret only incidentally.

**The one scope the sweeps don't need** — force-baseline adds **Actions: read and write** on the owner's
repositories to that PAT. Dispatching another repo's workflow is an Actions *write*, so a token scoped
for the three read-only sweeps answers `403` on every member. The sweep reports that per repo as
`no-permission` and fails the run rather than retrying: it is a grant to fix once, not a transient. The
sweeps themselves are unaffected — they never dispatch anything.

**What freshness assumes** — baselining reverts a stamp-only bump, so `claudinite.updated` advances
only when canon changed that member's vendor set. Age of the **stamped ref** is therefore the honest
liveness measure, and `behind` reads *"has not picked canon up in `staleDays`"*, not *"canon moved"*.
A member whose vendor set genuinely saw no change in the window is the one false positive; `staleDays`
is the knob, and the drift issue says so.

**When they fail** — a repo the census cannot classify is `unknown`, never uncovered, and a member the
freshness sweep cannot probe is `unknown`, never behind: no issue opened, no open issue closed on its
behalf, and a non-zero exit. A non-zero preprocessing subprocess fails the task, and the scheduler
converges one open `needs-human` issue for it.
