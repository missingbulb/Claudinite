# sheepdog — the fleet enforcer marker

Declaring this pack marks a repo as the **fleet enforcer**: the one repo that covers and maintains
every repo under an owner. It's opt-in — a dedicated `sheepdog` repo declares it (it is **not** seeded
by `--init`).

It contributes the pieces only a fleet enforcer needs — two **cross-repo sweeps** — plus their config
schema and the scheduled tasks that run them. The rest of the machinery — running the daily-run (the
orchestrator), the task engine (`engine/scheduler/`), scheduling — is Claudinite **core**, because
baselining and the daily-run are Claudinite's own responsibility, not the pack's.

**Two sweeps, two questions** — separate, on separate labels, because they close on unrelated
conditions. The **census** ([check-fleet-coverage.mjs](tasks/fleet-census/check-fleet-coverage.mjs)) asks *is this repo a
member* and converges `fleet-adoption` issues. The **freshness sweep**
([check-fleet-freshness.mjs](tasks/fleet-freshness/check-fleet-freshness.mjs)) takes coverage as given, asks *is that
membership still meaning anything*, and converges `fleet-drift` issues. The second exists because
per-project scheduling made every member maintain itself and removed the last outside look at one:
self-maintenance cannot detect its own absence.

**Where the code lives** — each sweep sits **inside its task's folder**, because only that task's
`worker.mjs` uses it. The pack root holds just what both need: [fleet-api.mjs](fleet-api.mjs) (cross-repo
REST primitives) and [fleet-config.mjs](fleet-config.mjs) (the one reader of the entry `config` below).

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

**Classification** — both sweeps are ordinary **pack tasks**, not fleet mechanisms. Their
*implementation* — an account-spanning PAT — happens to scan every repo under the owner, but their
declaration, scheduling, and lifecycle are exactly those of any pack task. Neither declares the
`fleet` signal nor `session_scope: fleet`; the cross-repo reach lives in the implementation, never in
how a task is wired. (The task files carry the same note.)

**How they run** — as the pack's [`fleet-census`](tasks/fleet-census/task.md) (`daily`) and
[`fleet-freshness`](tasks/fleet-freshness/task.md) (`weekly`) scheduled tasks, both `agent_model: none`
and `expected_outcome: none` (they open **issues**, never a PR), each with its sweep as
`agent_preprocessing`. Freshness is weekly because drift is measured in days — a daily sweep would
re-ask a question whose answer cannot have changed. There is **no coverage workflow** — preprocessing
runs Action-side inside this repo's one scheduler workflow, so the repo Actions secret is already
reachable there; each task's `required_secrets: ['FLEET_GITHUB_TOKEN']` stamps the name into that
workflow's env and is what asks the owner for it (a fine-grained PAT spanning the owner's repos:
Metadata + Contents read, Issues read/write, and Contents write on this repo for baseline-migration
retirement — freshness adds no scope). A workflow that exists only to hold a secret is redundant
([packs/basics/scheduled-tasks.md](../basics/scheduled-tasks.md)).

**What freshness assumes** — baselining reverts a stamp-only bump, so `claudinite.updated` advances
only when canon changed that member's vendor set. Age of the **stamped ref** is therefore the honest
liveness measure, and `behind` reads *"has not picked canon up in `staleDays`"*, not *"canon moved"*.
A member whose vendor set genuinely saw no change in the window is the one false positive; `staleDays`
is the knob, and the drift issue says so.

**When they fail** — a repo the census cannot classify is `unknown`, never uncovered, and a member the
freshness sweep cannot probe is `unknown`, never behind: no issue opened, no open issue closed on its
behalf, and a non-zero exit. A non-zero preprocessing subprocess fails the task, and the scheduler
converges one open `needs-human` issue for it.
