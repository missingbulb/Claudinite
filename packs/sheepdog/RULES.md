# sheepdog — the fleet enforcer marker

Declaring this pack marks a repo as the **fleet enforcer**: the one repo that covers and maintains
every repo under an owner. It's opt-in — a dedicated `sheepdog` repo declares it (it is **not** seeded
by `--init`).

It contributes the one piece that only a fleet enforcer needs — the **census**
([check-fleet-coverage.mjs](check-fleet-coverage.mjs), the cross-repo walk) — plus its config schema
and the scheduled task that runs it. The rest of the machinery — running the daily-run (the
orchestrator), the task engine (`engine/scheduler/`), scheduling — is Claudinite **core**, because
baselining and the daily-run are Claudinite's own responsibility, not the pack's.

**Config** — this repo's `.claudinite-checks.json` carries, as its `packs` entry for this pack:

```json
{ "id": "sheepdog", "config": { "owner": "missingbulb", "kind": "user", "exclude": ["owner/repo-a"] } }
```

`owner` (default: this repo's owner) is who to cover; `exclude` is the repos deliberately kept out of
the fleet (a full `owner/name` each) — a repo is kept out by adding it here. `kind: "user"` today; org
support is a later addition.

**Classification** — the census is an ordinary **pack task**, not a fleet mechanism. Its
*implementation* — an account-spanning PAT — happens to scan every repo under the owner, but its
declaration, scheduling, and lifecycle are exactly those of any pack task. It declares neither the
`fleet` signal nor `session_scope: fleet`; the cross-repo reach lives in the implementation, never in
how the task is wired. (The task file carries the same note.)

**How it runs** — as the pack's [`fleet-census`](tasks/fleet-census/task.md) scheduled task: `daily`,
`agent_model: none`, `expected_outcome: none` (it opens adoption **issues**, never a PR), with the
census as its `agent_preprocessing`. There is **no coverage workflow** — preprocessing runs
Action-side inside this repo's one scheduler workflow, so the repo Actions secret is already reachable
there; the task's `required_secrets: ['FLEET_GITHUB_TOKEN']` stamps the name into that workflow's env
and is what asks the owner for it (a fine-grained PAT spanning the owner's repos: Metadata + Contents
read, Issues read/write, and Contents write on this repo for baseline-migration retirement). A
workflow that exists only to hold a secret is redundant
([packs/basics/scheduled-tasks.md](../basics/scheduled-tasks.md)).

**When it fails** — a repo whose marker check errors is `unknown`, never uncovered: no adoption issue,
and the census exits non-zero. A non-zero preprocessing subprocess fails the task, and the scheduler
converges one open `needs-human` issue for it.
