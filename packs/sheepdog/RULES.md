# sheepdog — the fleet enforcer marker

Declaring this pack marks a repo as the **fleet enforcer**: the one repo that covers and maintains
every repo under an owner. It's opt-in — a dedicated `sheepdog` repo declares it (it is **not** seeded
by `--init`) — and it turns what used to be bespoke Claudinite fleet infrastructure into a declaration.

The pack is thin. It contributes the one piece that only a fleet enforcer needs — the **census**
([check-fleet-coverage.mjs](check-fleet-coverage.mjs), the cross-repo walk) — plus its config schema
and the scheduled task that runs it. The rest of the machinery — running the daily-run (the orchestrator),
the run_daily engine, scheduling — is Claudinite **core** (`routines/`), because baselining and the
daily-run are Claudinite's own responsibility, not the pack's. Declaring `sheepdog` adds only the
cross-repo reach: the census, the owner/exclude config, and the token that spans the fleet.

**Config** — this repo's `.claudinite-checks.json` carries, as its `packs` entry for this pack:

```json
{ "id": "sheepdog", "config": { "owner": "missingbulb", "kind": "user", "exclude": ["owner/repo-a"] } }
```

`owner` (default: this repo's owner) is who to cover; `exclude` is the repos deliberately kept out of
the fleet (a full `owner/name` each). `kind: "user"` today; org support is a later addition. This
replaces the old opt-out list — a repo is kept out by adding it here.

**Classification** — the census is an ordinary **pack task**, not a fleet mechanism. Its
*implementation* — an account-spanning PAT — happens to scan every repo under the owner, but its
declaration, scheduling, and lifecycle are exactly those of any pack task: it is active because this
repo declares the pack, and it runs however this repo's tasks run. It declares neither the `fleet`
signal nor `session_scope: fleet`; the cross-repo reach lives in the implementation, never in how the
task is wired. (The task file carries the same note.)

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
converges one open `needs-human` issue for it — the escalation the retired workflow's `report-failure`
job used to provide.
