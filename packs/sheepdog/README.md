# sheepdog

The fleet **enforcer** marker — declaring it makes a repo the one that covers and maintains every repo
under an owner. Opt-in (a dedicated sheepdog repo declares it; **not** seeded by `--init`). It
standardizes the fleet coverage that used to be bespoke Claudinite infrastructure into a declaration.

Thin by design: prose + the config schema (the sheepdog pack entry's `config` = `{ owner, kind, exclude,
canonRepo, staleDays, packSeeds, digest }`) + six cross-repo **sweeps/levers**, each a
scheduled task whose sweep is its `prework`. The pack carries **no workflow**, and only the
digest runs an agent *here* — everything else agentic happens in the *member*, on the fan-out model
([#749](https://github.com/missingbulb/Claudinite/issues/749)) — the enforcer dispatches, the
member executes:

| sweep | task | asks |
|---|---|---|
| [check-fleet-roster.mjs](tasks/fleet-roster/check-fleet-roster.mjs) → [adoption-issues.mjs](tasks/fleet-roster/adoption-issues.mjs) + [drift-issues.mjs](tasks/fleet-roster/drift-issues.mjs) | [fleet-roster](tasks/fleet-roster/task.md) (daily) | is this repo a **member**, and is that membership still **meaning** anything? → adoption issues + drift issues |
| [scan-for-needed-packs.mjs](tasks/fleet-add-missing-packs/scan-for-needed-packs.mjs) + [force-add-packs.mjs](tasks/fleet-add-missing-packs/force-add-packs.mjs) | [fleet-add-missing-packs](tasks/fleet-add-missing-packs/task.md) (weekly, and forceable) | which packs is a member missing — the ones its **shape** suspects, or the ones the owner named? → a work-list issue *in* each member + that member's scheduler fired; the member's own agent adopts |
| [aggregate-fleet-usage.mjs](tasks/fleet-usage/aggregate-fleet-usage.mjs) | [fleet-usage](tasks/fleet-usage/task.md) (daily) | what does the fleet **actually use**? → `usage-fleet.GENERATED.json` |
| [check-fleet-pack-seeds.mjs](tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs) | [fleet-pack-seeds](tasks/fleet-pack-seeds/task.md) (daily) | does a member declare what this fleet **standardizes on**? → the declaration, written |
| [force-fleet-baseline.mjs](tasks/fleet-baseline/force-fleet-baseline.mjs) | [fleet-baseline](tasks/fleet-baseline/task.md) (`manual` — forced runs only) | make every member baseline **now** → each member's own run, reported in its own repo |
| [collect-fleet-day.mjs](tasks/fleet-digest/collect-fleet-day.mjs) | [fleet-digest](tasks/fleet-digest/task.md) (daily, an hour after the rest) | what did the fleet **accomplish** yesterday, and what has it let go **quiet**? → `digests/<date>.md` |

**The roster carries two questions** because they are asked of the same repos from the same walk
([#788](https://github.com/missingbulb/Claudinite/issues/788)). The freshness half exists because
per-project scheduling made every member maintain itself and, in doing so, removed the last thing that
looked at a member from the **outside** — self-maintenance cannot detect its own absence. It used to be
its own weekly task with its own enumeration, and re-derived the coverage it claimed to take as given;
the two then classified the same repo differently (an excluded repo carrying a declaration read
*covered* to one and *out of scope* to the other), and each half's `unknown` failed its own run knowing
nothing of the other's. What is still split is the two **issue families** — they close on unrelated
conditions — not the walk.

**Missing-packs** exists because a pack's `detect` fingerprint is consulted **once**, at
bootstrap's `--init`: baselining backfills the seeded packs and each declared pack's `requires`
closure, but never re-fingerprints, so a member that grows into a pack after adoption is never told
the pack exists and the owner has to already know what to ask for. **Usage** exists for the same
shape of reason one rung up: a member can say whether a skill loads *there*, and only a view across
every member can say whether it earns its place at all. **Pack-seeds** is the only one that **writes** to a
member: some packs need a parameter no member can derive, because the answer is a fact about the
*fleet* — and canon cannot supply it either, since a bootstrap run does not know which fleet it is
bootstrapping into. This repo's `packSeeds` config lists what its members should declare, and the
sweep converges that list. It names no pack itself: the fleet supplies every id.

**The pack-seed sweep stays narrow on purpose**: one declaration from `packSeeds`, one PUT to the
member's default branch guarded by the blob sha the read returned, idempotent, no issue in either
direction. Three properties keep it safe. It **names no pack** — every id comes from config, so the
enforcer never becomes a second place packs are known. It **gates on the member's own mount**: a
declared pack whose code is absent is a blocking `config` error there, and a member's mount carries
only what it declared as of its last converge, so the sweep writes only where the pack is already on
disk — `not-vendored` is a wait rather than a finding, and members converge nightly, so a rollout
needs no coordination. And it **seeds, never overrides**: a member that already declares the pack, or
already carries a config for it, keeps both. The fleet's list is a floor, and a choice a repo made is
a decision the sweep cannot second-guess.

That is also why the enforcer states a seeded pack's config **twice** — in `packSeeds`, and in its
own entry for that pack — and why `seeds-agree` holds the two to each other. Nothing compares them at
seed time, and a member has no way to know what the enforcer kept for itself, so an enforcer running
one configuration while the fleet runs another is silent until someone looks.

A pack arriving *with* canon reaches the fleet that already exists through a **baseline migration**
instead — a `declarePacks` op applied by each member's own update run, in the same transactional
commit that vendors the pack's code. The sweep is the **standing** half: a migration record is dated
and retires, while the sweep keeps converging every member the fleet acquires after it is gone.

**The digest** is the one output addressed to a *person* rather than to the machinery: a dated
plain-text brief of what the fleet actually did, one file a morning, plus a prod about a project that
has gone quiet. Its collector filters Claudinite's own maintenance PRs and work items out of
**every** stream it reads — the machine is the fleet's busiest actor, and rank by size or by
discussion and its own bookkeeping does not merely appear in the results, it wins them. The brief is
plain text despite its `.md` name because it is *sent*, verbatim, through a renderer that neither
parses markdown nor keeps line breaks; the `digest-plain-text` check holds the landed series to that.
It runs at `daily+1h`, an hour behind the other sweeps: nothing in it depends on them, but a brief
written while the census is still running reports a fleet in mid-sweep, and the owner reads one story
about the fleet each morning, in order.

Its two config knobs sit under `digest` on the pack entry:

| key | default | what it does |
|---|---|---|
| `pick` | `4` | how many accomplishments the brief names (the shortlist is `ceil(pick × 1.5)`, so the agent has a real choice to make rather than a ranking to transcribe) |
| `nudge` | on, 7 days | the "worth returning to" prod. `false` switches it off; `{ "quietDays": 21 }` widens the window |

**Quiet is measured on meaningful merges, never on pushes.** Every member's mount is converged
nightly, so `pushed_at` is fresh on every repo in this fleet every day and would report the whole
fleet as permanently active.

It came from the enforcer's own local pack in
[#954](https://github.com/missingbulb/Claudinite/issues/954): the task ends at a written file, so it
carries no address, no recipient and no transport, and what a fleet has an opinion about is `pick` and
`nudge` — two config knobs, both defaulted.

The fit sweep fingerprints against a scratch clone of `canonRepo`, never against this repo's own
mount — the mount carries only the packs the enforcer declares, and sweeping against it would report
every member as fitted while testing almost nothing. Its report names the corpus it measured against,
so a shrunken denominator is visible rather than silent.

**Two tasks have an agent stage, and both split the same way** — everything decidable in code
stays in the agentless `prework`, and the agent is reached only for the part that is genuinely a
judgment. For the **digest** that is picking the day's real accomplishments out of a size-ranked
shortlist; on a day the fleet merged nothing the prework writes the brief itself and requests no
agent, because "nothing happened" needs no model but a *missing* file in a dated series has to stay
legible as a fault. For the **fit sweep** it is a judgment plus a repo edit — confirming the
suspicion and running the [adopt-pack](../core/skills/adopt-pack/SKILL.md) skill against the member —
while enumerate, fingerprint and converge-the-issues stay in code. That one is ceilinged at `open-pr`
and never auto-merges: declaring a pack switches on conformance checks that run in that member's CI
from the moment they land.

**No agent anywhere here reaches another repo**, and that is the trust model rather than an
implementation detail ([#749](https://github.com/missingbulb/Claudinite/issues/749)). The first
missing-packs design ended in an enforcer-side agent stage, and its very first production run stopped
at `needs-human` because the enforcer's executor is — correctly — scoped to the enforcer repo alone.
What crosses a repo boundary is an issue and a `workflow_dispatch`, both over `FLEET_GITHUB_TOKEN`;
the deprecated task-level `session_scope` ([scheduled-tasks.md](../core/scheduled-tasks.md)) has no
place here. The digest's agent is not an exception — it reads what its prework already fetched and
writes one file in this repo.

A member that declares itself **dormant** (`"dormant": true` in its own declaration) is out of the
roster's freshness half, out of the fit sweep, out of the usage denominator, and never written to by the
pack-seed sweep — its scheduler is stopped, so its mount falls behind by design, its silence says
nothing about any skill, recommending it a pack would be recommending work it has declared it is not
doing, and a commit landed in it from outside is the upkeep it opted out of. It stays a **member**:
membership is unchanged, because dormancy is about upkeep, not membership.

**Every report enumerates the full fleet.** Whatever a repo's state — covered, dormant, uncovered,
excluded, archived, a fork, inactive today, or simply not measured by that sweep — each sweep's
report names it under exactly one state rather than dropping it. A roster that names only the
exceptions has silent holes, and a reader cannot tell "fine" from "fell out of the report": the
roster's coverage section lists covered members (dormant ones flagged) alongside the uncovered, and its
freshness section names its fresh members and its out-of-scope repos with why; the fit sweep names the members that came
back **fitted** as loudly as the ones with findings, and names the fingerprints it could not decide
from outside rather than counting them as non-matches; the usage sweep's `coverage` section
accounts for every repo under the owner and its run report flags folding members with no captured
activity that day; fleet-baseline reports every repo it did *not* dispatch, with the reason.

**Undecidable is not a non-match.** Most fingerprints are answerable from a path listing, and the fit
sweep answers those over one tree call per member; one that reads file *contents* is resolved by a
bounded prefetch of exactly the files it asked for, and one that greps every source file exceeds that
budget and is reported **undecided**. The member's own agent — which has the repo checked out —
settles those exactly ([fingerprint-fit.mjs](tasks/fleet-add-missing-packs/fingerprint-fit.mjs)). A
truncated tree listing makes every non-match on that repo undecided for the same reason: "we did not
look" and "we looked and it isn't there" are different facts, and only one is safe to act on.

**A sweep that cannot see a repo says so and fails.** A repo whose declaration the roster cannot read
is `unknown` to both its questions, never uncovered and never behind; a member whose mount probe
fails is `unknown` to freshness alone, because its declaration was read and the coverage verdict
stands; a member the fit scan cannot read is `unknown`, never fitted; a member whose scheduler
refused a fan-out dispatch is named and fails the run, because a work list nobody will act on is not
a green outcome; and a member the pack-seed sweep cannot reach opens no issue, closes none on its
behalf, and exits non-zero. A non-zero preprocessing subprocess fails the task, and the scheduler
converges one open `needs-human` issue for it.

**The two operator levers ride the work-item queue, not a workflow.** `fleet-baseline` is the first
`manual`-frequency task: never instantiated on any cadence, it runs only from an item the owner
creates by hand — `create-work-item sheepdog/fleet-baseline`, with `REPOS=…`, `DRY_RUN=true`,
`INCLUDE_DORMANT=true` as `--context` lines — which wakes every covered member's own standing
`baselining` item so the fleet picks canon up now instead of over the next day. A forced
fleet-add-missing-packs item is the second lever, same command, its own Context. Neither
waits on what it fired: a dispatch queues a member's own run, and each member reports its own
outcome where it always does. (The standalone fleet-baseline workflow, its fleet-wide follow
report, and the `.github/` managed copy it required were retired 2026-08-11 —
[#749](https://github.com/missingbulb/Claudinite/issues/749),
[`2026-08-11-fleet-baseline-task`](migrations/2026-08-11-fleet-baseline-task/migration.mjs).)

Each sweep lives **inside its task's folder**, because nothing outside that task uses it. Only what
they all share sits at the pack root: [fleet-api.mjs](fleet-api.mjs) (the cross-repo REST
primitives, including the one that fires a member's scheduler) and
[fleet-config.mjs](fleet-config.mjs) (the one reader of this pack's entry `config`).

The rest of the machinery — running the daily-run, the task engine (`engine/scheduler/`), scheduling —
is Claudinite **core**. What a session in an enforcer repo has to get right: [RULES.md](RULES.md).

## Config

The enforcer's `.claudinite-checks.json` carries, as its `packs` entry for this pack:

```json
{ "id": "sheepdog", "config": { "owner": "missingbulb", "kind": "user", "exclude": ["owner/repo-a"],
                                "canonRepo": "missingbulb/Claudinite", "staleDays": 14,
                                "packSeeds": [{ "id": "<a pack>", "config": { … } }],
                                "digest": { "pick": 4, "nudge": { "quietDays": 7 } } } }
```

| key | default | what it is |
|---|---|---|
| `owner` | this repo's owner | whose repositories make up the fleet |
| `kind` | `"user"` | org support is a later addition |
| `exclude` | none | the repos deliberately kept out, a full `owner/name` each |
| `canonRepo` | `<owner>/Claudinite` | what a member's installed versions are measured against — named rather than inferred, because a version tells you nothing about where it came from |
| `staleDays` | `14` | the legacy date measure, for a member still declaring the retired `baselining` mechanism |
| `packSeeds` | none | what this fleet wants every member to declare, each `{ id, config? }`. The **only** place a pack is named: the sweep carries the mechanism, the fleet carries the choice |
| `digest` | everything | the brief's knobs, `pick` and `nudge` ([digest-config.mjs](tasks/fleet-digest/digest-config.mjs) spells out what each accepts) |

Every key defaults, so an existing sheepdog config keeps working untouched.
[fleet-config.mjs](fleet-config.mjs) is the one reader of all of it.

## How the tasks are wired

Ordinary **pack tasks**, not fleet mechanisms. Their *implementation* — an account-spanning PAT —
happens to scan every repo under the owner, but their declaration, scheduling and lifecycle are
exactly those of any pack task. None declares the `fleet` signal: the cross-repo reach lives in the
implementation, never in how a task is wired.

| task | frequency | agent | outcome |
|---|---|---|---|
| `fleet-roster` | daily | none | none |
| `fleet-add-missing-packs` | weekly (forceable) | none | none |
| `fleet-usage` | daily | none | `merged-pr` |
| `fleet-pack-seeds` | daily | none | none |
| `fleet-baseline` | manual | none | none |
| `fleet-digest` | `daily+1h` | sonnet | `merged-pr` |

The cadences follow what each question can change on. Roster is daily on its coverage question, and
its freshness half rides along rather than gating on a weekly clock it would have to compute; usage
is daily because the members fold daily; pack seeds is daily because a member becomes writable the
moment its nightly converge vendors the pack, which makes daily mean "the next morning"; the digest
is `daily+1h` so it reads a fleet the other sweeps have finished with.

Two ceilings are `merged-pr` because those tasks' output *is* a tracked file: an auto-merging PR
keeps the write inside the outcome taxonomy, lets this repo's CI gate a malformed one, and makes the
daily PR stream a browsable audit trail. The pack-seed sweep is `none` for a different reason — its
write goes to **other** repos, and the ceiling describes what a task may do to its own. What only a
repo edit can finish is the member's own adopt-requested-packs task's, ceilinged at `open-pr`
*there*.

There is **no coverage workflow**: preprocessing runs Action-side inside the repo's one scheduler
workflow, where the Actions secret is already reachable, and each task's
`required_secrets: ['FLEET_GITHUB_TOKEN']` stamps the name into that workflow's env — which is what
asks the owner for it. A workflow that exists only to hold a secret is redundant
([scheduled-tasks.md](../core/scheduled-tasks.md)).

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Keeping a repo out of the fleet | low | correctness | prose: 75 words |
| Adding or changing a packSeeds entry | critical | correctness | prose: 66 words |
| Declaring a pack this fleet also seeds | high | correctness | prose: 66 words |
| Acting on an add-packs work-list issue | high | correctness | prose: 70 words |
| Acting on a scanned pack suggestion | medium | correctness | prose: 77 words |
| Reading unknown in a report | high | correctness | prose: 64 words |
| Judging whether a member is behind | high | correctness | prose: 62 words |
| Answering why the fleet did not move | medium | complexity | prose: 52 words |
| Pushing canon to the whole fleet now | low | complexity | prose: 119 words |
| Catching the digest up after an outage | low | complexity | prose: 66 words |
| Adding a pack across the fleet | medium | complexity | prose: 53 words |
| Granting or repairing FLEETGITHUBTOKEN | high | correctness | prose: 53 words |
| A fan-out task reporting no-permission | medium | complexity | prose: 50 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `fleet-pack-seed-agrees` | medium | correctness | check: blocking |
| `digest-plain-text` | medium | correctness | check: blocking |
| `dated-fixture-collision` | medium | correctness | check: blocking |
