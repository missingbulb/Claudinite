# Fleet bootstrap sweep (adopt the uncovered, baseline the members)

Daily, fleet-level step owning all bootstrap work: after it runs, every repo under the owner's
account mounts Claudinite with current wiring and current rules — or is opted out, or sits in the
adoption queue awaiting the owner. Sequenced by
[auto-all-repos-maintenance.md](auto-all-repos-maintenance.md), one isolated subagent per target
repo, never scheduled on its own; works entirely over the GitHub API tooling, never a clone.

## Step 1 — dispatch the census (the fleet-credentialed executor)

Classification is code, not prose: trigger the `Fleet Coverage` workflow
([fleet-coverage.yml](../.github/workflows/fleet-coverage.yml) →
[check-fleet-coverage.mjs](check-fleet-coverage.mjs)) via `workflow_dispatch` and await the run
(poll on a rolling backoff). It carries the `FLEET_GITHUB_TOKEN` fine-grained PAT (this account,
all repositories, Contents + Metadata read, Issues read/write), so it sees what no session
allowlist can. Its contract: it classifies every repo (covered / uncovered / opted-out / skipped
forks, archived, home; honoring [the opt-out list](fleet-bootstrap-opt-out.md); an erroring marker
check is unknown, never uncovered) and converges the **adoption queue** — one open home-repo issue
per actionable uncovered repo, title `Adopt <owner>/<repo> into the Claudinite fleet`, label
`fleet-adoption`, auto-closed once covered or opted out. It also probes each declared
[migration](../migrations/README.md)'s legacy shape across the fleet and **auto-retires** any that
every repo has left behind (deleting its record from the home repo) — the telemetry that lets a
rename's tolerance be dropped without a manual judgment call.

The census is an executor, not an orchestrator: **no schedule of its own** — it runs when this
sweep (or the owner, manually) dispatches it. If its run fails: skip adoption tonight, log on the
tracker; members still get baselined.

## Step 2 — members: baselining + align

Per member repo (never the home repo — the canon doesn't mount itself):

- **Baselining** — re-run the idempotent bootstrap ([../bootstrap.md](../bootstrap.md)) to
  refresh the mount and the wiring it owns. Most days nothing drifted → commit nothing. A pack
  declaration missing `basics` is drift — no pack is active by default, so the bootstrap's
  backfill step materializes the explicit `"basics"` entry.
- **Declared migrations** — in-flight path relocations are declared once in
  [migrations/](../migrations/README.md); baselining's own idempotent steps land each
  consumer-side legacy→canonical rename over the API (as they already do for the artifacts they
  own), converging the member to the canonical shape. This step only lands the rename — Step 1's
  census is what confirms fleet-wide completion and retires the migration.
- **Align** — evaluate the repo against its declared packs' current checks (the same engine its
  Stop hook and CI run). Apply a failing check's own `fix` remedy, never more; a finding needing
  judgment becomes an issue in the member repo, not an edit.
- **Enrollment issue** — being reached proves enrollment: never open one; close a still-open one
  (title `Enroll <PROJECT_NAME> in Claudinite fleet maintenance`, found by title) as `completed`
  with a one-line comment.
- Safe alongside the growth phases: they write project docs; this writes wiring and check-mandated
  fixes.

## Step 3 — adoption: work the queue

Adopt **only repos with an open adoption issue** — the census already applied every eligibility
rule. Per queued repo the session can reach: run the bootstrap per
[../bootstrap.md](../bootstrap.md); first adoption, so **do open** its Part 4 enrollment issue,
noting in it the owner-in-the-loop parts skipped unattended (project classification, cloud env
setup) and anything the API couldn't do. A queued repo the session can't reach stays queued — the
issue is the owner's cue to grant access; log it on the tracker and move on.

## Delivery — the explicit per-member flag

Member-side changes (baselining + alignment) are delivered per `maintenance.delivery` in the
member's `.claudinite-checks.json` — always explicit, never an implicit default (the
engineering-practices lesson): `--init` seeds `"push"`, and a missing key is drift — materialize
`{ "maintenance": { "delivery": "push" } }` as a direct commit.

- `push` — commit directly to the member's default branch.
- `pr` — amend the stable `claudinite/maintenance` branch and its single open PR; never merge it.
- Unrecognized value — commit nothing to that repo; open an issue there naming the bad value.

Adoption necessarily precedes the flag: a first bootstrap lands as a direct commit.

## Tracking

One standing home-repo issue, found by title `Claudinite fleet coverage` (open if absent; reopen if
closed while something needs logging). Body: the current picture, dated, rewritten when it changed.
Comments: a dated entry per run that did something — adoptions, queued-but-unreachable repos,
failures. Clean day: write nothing. Baselining refreshes log nothing (the commit is the record);
a failed member run lands on the fleet routine's failure log.

## Run on a capable model

The bootstrap and alignment merge into existing `CLAUDE.md` / `settings.json` without clobbering —
judgment calls. Run the subagents on a capable model.

## Never

- Touch the home repo — either half.
- Adopt a repo without an open adoption issue (the census's eligibility rules are the only path in).
- Uninstall. The opt-out list gates adoption only; withdrawing a repo = the owner unmounts it there
  **and** lists it, or the sweep re-adopts.
- Merge a delivery PR, or guess a delivery preference.
- Let alignment edit beyond a failing check's own remedy.
- Schedule the census or this sweep — the fleet routine is the only schedule; the census runs only
  when dispatched.
