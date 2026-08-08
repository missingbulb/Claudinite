# sheepdog — the fleet enforcer marker

Declaring this pack marks a repo as the **fleet enforcer**: the one repo that covers and maintains
every repo under an owner. It's opt-in — a dedicated `sheepdog` repo declares it (it is **not** seeded
by `--init`).

It contributes the pieces only a fleet enforcer needs — four **cross-repo sweeps** — plus their config
schema and the scheduled tasks that run them. The rest of the machinery — running the daily-run (the
orchestrator), the task engine (`engine/scheduler/`), scheduling — is Claudinite **core**, because
baselining and the daily-run are Claudinite's own responsibility, not the pack's.

**Four sweeps, four questions** — separate, because they close on unrelated conditions. The
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
all is fleet-shaped, and nothing inside a member can see it. The **pack-seed sweep**
([check-fleet-pack-seeds.mjs](tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs)) asks *does each member
declare what this fleet standardizes on* and **adds the declaration** where it is missing. It exists
because some packs need a parameter no member can derive — the answer is a fact about the fleet, and canon
cannot supply it either, since a bootstrap run does not know which fleet it is bootstrapping into. Only
this repo knows: it is the fleet.

**The pack-seed sweep is the one that writes to members**, and it stays narrow on purpose: one pack
declaration from this repo's `packSeeds` list, one PUT to the member's default branch guarded by the blob
sha the read returned, idempotent, no issue in either direction. Three rules keep it safe. It **names no
pack** — every id comes from the config, so the enforcer never becomes a second place packs are known. It
**gates on the member's own mount**: a declared pack whose code is absent is a blocking `config` error
there, and a member's mount carries only what it declared as of its last converge, so the sweep writes
only where the pack is already on disk — `not-vendored` is a wait, not a finding, and members converge
nightly, so the rollout needs no coordination. And it **seeds, never overrides**: a member that already
declares the pack, or already carries a config for it, keeps both — the fleet's list is a floor, and a
choice a repo made is a decision the sweep cannot second-guess. A dormant member is never written to.

A pack arriving with canon reaches the fleet that already exists through a **baseline migration** instead
(a `declarePacks` op, applied by each member's own baselining in the same transactional commit that
vendors the pack's code). This sweep is the **standing** half: a migration record is dated and retires,
while the sweep keeps converging every member the fleet acquires after it is gone.

**One manual lever, not a fifth sweep** — [force-fleet-baseline.mjs](fleet-baseline/force-fleet-baseline.mjs)
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
own inputs (repo filter, dry run, dormant opt-in, follow), and starts when a human presses *Run workflow*. Its
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
need: [fleet-api.mjs](fleet-api.mjs) (cross-repo REST primitives — read-only toward members but for the
one `putFile` the pack-seed sweep needs) and
[fleet-config.mjs](fleet-config.mjs) (the one reader of the entry `config` below).

**Config** — this repo's `.claudinite-checks.json` carries, as its `packs` entry for this pack:

```json
{ "id": "sheepdog", "config": { "owner": "missingbulb", "kind": "user", "exclude": ["owner/repo-a"],
                                "canonRepo": "missingbulb/Claudinite", "staleDays": 14,
                                "packSeeds": [{ "id": "<a pack>", "config": { … } }] } }
```

`owner` (default: this repo's owner) is who to cover; `exclude` is the repos deliberately kept out of
the fleet (a full `owner/name` each) — a repo is kept out by adding it here. `kind: "user"` today; org
support is a later addition. `canonRepo` (default `<owner>/Claudinite`) is what a member's stamped ref
is measured against — named rather than inferred, because a ref tells you nothing about where it came
from. `staleDays` (default `14`) is how far behind is too far. `packSeeds` (default: **none**) is what
this fleet wants every member to declare — each `{ id, config? }`, seeded into members that lack it. This
list is the **only** place a pack is named: the sweep carries the mechanism, the fleet carries the
choice. All three default, so an existing sheepdog config keeps working untouched.

**Classification** — all four sweeps are ordinary **pack tasks**, not fleet mechanisms. Their
*implementation* — an account-spanning PAT — happens to scan every repo under the owner, but their
declaration, scheduling, and lifecycle are exactly those of any pack task. None declares the
`fleet` signal nor `session_scope: fleet`; the cross-repo reach lives in the implementation, never in
how a task is wired. (The task files carry the same note.)

**How they run** — as the pack's [`fleet-census`](tasks/fleet-census/task.md) (`daily`),
[`fleet-freshness`](tasks/fleet-freshness/task.md) (`weekly`),
[`fleet-usage`](tasks/fleet-usage/task.md) (`daily`) and
[`fleet-pack-seeds`](tasks/fleet-pack-seeds/task.md) (`daily`) scheduled tasks, all `agent_model: none`,
each with its sweep as `prework`. All are `expected_outcome: none` except usage
(`merged-pr`), because its output IS a tracked file and an
auto-merging PR keeps that write inside the outcome taxonomy, lets this repo's CI gate a malformed
file, and makes the daily PR stream a browsable audit trail. The pack-seed sweep is `none` for a
different reason: its write goes to **other** repos, and the ceiling describes what a task may do to its
own. Freshness is weekly because drift is
measured in days — a daily sweep would re-ask a question whose answer cannot have changed; usage is
daily because the members fold daily; pack seeds is daily because a member becomes writable the moment
its nightly converge vendors the pack, and daily makes that "the next morning". There is **no coverage workflow** — preprocessing
runs Action-side inside this repo's one scheduler workflow, so the repo Actions secret is already
reachable there; each task's `required_secrets: ['FLEET_GITHUB_TOKEN']` stamps the name into that
workflow's env and is what asks the owner for it (a fine-grained PAT spanning the owner's repos:
Metadata read, **Contents read and write**, Issues read/write — freshness adds no scope, and the
pack-seed sweep is what raises Contents from read-only across the fleet to read/write, because writing
one declaration into each member is its whole job; Contents write on this repo also covers
baseline-migration retirement). A workflow that exists only to hold a secret is redundant
([packs/basics/scheduled-tasks.md](../basics/scheduled-tasks.md)) — the force-baseline workflow above is
not that: it exists because the operation is manual, and it reads the same secret only incidentally.

**The one scope the sweeps don't need** — force-baseline adds **Actions: read and write** on the owner's
repositories to that PAT. Dispatching another repo's workflow is an Actions *write*, so a token scoped
for the sweeps alone answers `403` on every member. The sweep reports that per repo as
`no-permission` and fails the run rather than retrying: it is a grant to fix once, not a transient. The
sweeps themselves are unaffected — they never dispatch anything. Watching what it dispatched adds two
more *read* scopes to the same PAT — **Pull requests: read** and **Issues: read**; without them a
followed run reports every member as unfinished, and never the reverse.

**What freshness assumes** — baselining reverts a stamp-only bump, so `claudinite.updated` advances
only when canon changed that member's vendor set. Age of the **stamped ref** is therefore the honest
liveness measure, and `behind` reads *"has not picked canon up in `staleDays`"*, not *"canon moved"*.
A member whose vendor set genuinely saw no change in the window is the one false positive; `staleDays`
is the knob, and the drift issue says so.

**Full-roster reporting** — every sweep's report enumerates the whole fleet, not just its findings.
Each repo under the owner lands in the report under exactly one named state — covered, dormant,
uncovered, opted out, archived/fork, unknown, fresh, behind, out of scope, inactive today, skipped
with a reason — and the repos a sweep deliberately never measures (the enforcer itself, canon) are
named as such rather than silently absent. The sheepdog provides data on the fleet regardless of
state: a roster that names only the exceptions has silent holes, and a reader cannot tell "fine"
from "fell out of the report".

**When they fail** — a repo the census cannot classify is `unknown`, never uncovered; a member the
freshness sweep cannot probe is `unknown`, never behind; a member the pack-seed sweep cannot read or
write is `unknown`, never assumed converged: no issue opened, no open issue closed on its
behalf, and a non-zero exit. A non-zero preprocessing subprocess fails the task, and the scheduler
converges one open `needs-human` issue for it.
