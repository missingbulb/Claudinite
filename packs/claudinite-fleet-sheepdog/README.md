# claudinite-fleet-sheepdog

The fleet **enforcer** marker — declaring it makes a repo the one that covers and maintains every repo
under an owner. Opt-in (a dedicated claudinite-fleet-sheepdog repo declares it; **not** seeded by `--init`).

Thin by design: prose + the config schema (the claudinite-fleet-sheepdog pack entry's `config` = `{ owner, kind, exclude,
canonRepo, packSeeds }`) + five cross-repo **sweeps/levers**, each a
scheduled task whose sweep is its `code_work`. The pack carries **no workflow**, and nothing agentic
happens *here* — it happens in the *member*, on the fan-out model
where the enforcer dispatches and the
member executes:

| sweep | task | asks |
|---|---|---|
| [check-fleet-roster.mjs](tasks/fleet-roster/check-fleet-roster.mjs) → [adoption-issues.mjs](tasks/fleet-roster/adoption-issues.mjs) + [freshness.mjs](tasks/fleet-roster/freshness.mjs) | [fleet-roster](tasks/fleet-roster/README.md) (daily) | is this repo a **member**, and is that membership still **meaning** anything? → adoption issues + the run report's freshness section |
| [scan-for-needed-packs.mjs](tasks/fleet-add-missing-packs/scan-for-needed-packs.mjs) + [force-add-packs.mjs](tasks/fleet-add-missing-packs/force-add-packs.mjs) | [fleet-add-missing-packs](tasks/fleet-add-missing-packs/README.md) (weekly, and forceable) | which packs is a member missing — the ones its **shape** suspects, or the ones the owner named? → a work-list issue *in* each member + that member's scheduler fired; the member's own agent adopts |
| [check-fleet-pack-seeds.mjs](tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs) | [fleet-pack-seeds](tasks/fleet-pack-seeds/README.md) (daily) | does a member declare what this fleet **standardizes on**? → the declaration, written |
| [force-fleet-update.mjs](tasks/fleet-update/force-fleet-update.mjs) | [fleet-update](tasks/fleet-update/README.md) (`manual` — forced runs only) | make every member update **now**, then follow each to canon's published versions → an outcome table, not a dispatch count |

**The roster carries two questions** because they are asked of the same repos from the same walk.
The freshness half exists because
per-project scheduling made every member maintain itself and, in doing so, removed the last thing that
looked at a member from the **outside**: self-maintenance cannot detect its own absence.
What is still split is the two **issue families**, which close on unrelated
conditions, and not the walk.

**Missing-packs** exists because a pack's `detect` fingerprint is consulted **once**, at
bootstrap's `--init`: baselining backfills the seeded packs and each declared pack's `requires`
closure, but never re-fingerprints, so a member that grows into a pack after adoption is never told
the pack exists and the owner has to already know what to ask for. **Pack-seeds** is the only one that **writes** to a
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
own entry for that pack, and why `seeds-agree` holds the two to each other.

A pack arriving *with* canon reaches the fleet that already exists through a **baseline migration**
instead — a `declarePacks` op applied by each member's own update run, in the same transactional
commit that vendors the pack's code. The sweep is the **standing** half: a migration record is dated
and retires, while the sweep keeps converging every member the fleet acquires after it is gone.

The fit sweep fingerprints against a scratch clone of `canonRepo`, never against this repo's own
mount — the mount carries only the packs the enforcer declares, and sweeping against it would report
every member as fitted while testing almost nothing. Its report names the corpus it measured against,
so a shrunken denominator is visible rather than silent.

**The fit sweep's agent stage splits the way every one here does** — everything decidable in code
stays in the agentless `code_work`, and the agent is reached only for the part that is genuinely a
judgment. Here it is a judgment plus a repo edit — confirming the
suspicion and running the [adopt-pack](../claudinite-lifecycle/skills/adopt-pack/SKILL.md) skill against the member —
while enumerate, fingerprint and converge-the-issues stay in code. That one opens the PR and lands it
unattended there: declaring a pack switches on conformance checks that run in that member's
CI from the moment they land, and gate the merge.

**No agent anywhere here reaches another repo**, and that is the trust model rather than an
implementation detail.
What crosses a repo boundary is an issue and a `workflow_dispatch`, both over `FLEET_GITHUB_TOKEN`;
a task-level scope word ([the writing-tasks skill](../claudinite-growth/skills/writing-tasks/SKILL.md)) has no
place here.

A member whose **scheduler is dormant** (`dormant` on its own `claudinite-tasks` pack entry) is out of
**every upkeep question this pack asks**: out of the fit sweep, out of the usage
denominator, never written to by the pack-seed sweep, not measured by the roster's freshness half, and
dispatched by no fleet-wide operation. Its silence says nothing about any skill; recommending it a pack
would be recommending work it has declared it is not doing; a commit landed in it from outside is the
upkeep it opted out of; and a mount nothing will ever converge cannot be behind in a way anyone is
going to fix — a freshness verdict on one is a finding with no owner. It stays a **member**: membership
is unchanged, because dormancy is about upkeep, not membership, and the coverage census names it under
`dormant`. The one lever that still reaches one is the hand-typed `INCLUDE_DORMANT=true` on a
[fleet-update](tasks/fleet-update/README.md) item — a person asking for it by name.

A repo the fleet was told to **ignore** (`config.exclude`) is out further still: no sweep reads it at
all, so none of them learns whether it even carries a declaration, and every report names it once under
`ignored` and claims nothing else about it. A force that names one is refused rather than written
around — the remedy is to take the repo off the list.

**Every report enumerates the full fleet.** Whatever a repo's state — covered, dormant, uncovered,
excluded, archived, a fork, inactive today, or simply not measured by that sweep — each sweep's
report names it under exactly one state rather than dropping it. A roster that names only the
exceptions has silent holes, and a reader cannot tell "fine" from "fell out of the report": the
roster's coverage section lists covered members (dormant ones flagged) alongside the uncovered, and its
freshness section names its fresh members and its out-of-scope repos with why; the fit sweep names the members that came
back **fitted** as loudly as the ones with findings, and names the fingerprints it could not decide
from outside rather than counting them as non-matches; the usage sweep's `coverage` section
accounts for every repo under the owner and its run report flags folding members with no captured
activity that day; fleet-update reports every repo it did *not* dispatch, with the reason, and every repo it DID dispatch that never reached canon's versions.

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
parks one open issue for it.

**The two operator levers ride the work-item queue, not a workflow.** `fleet-update` is the first
task declaring `trigger: request`: not on the schedule, never asked at any tick, it runs only from
an item the owner creates by hand — `create-work-item claudinite-fleet-sheepdog/fleet-update`, with `REPOS=…`, `DRY_RUN=true`,
`INCLUDE_DORMANT=true`, `FOLLOW_MINUTES=…` as `--context` lines — which wakes every covered member's own
standing `update` item so the fleet picks canon up now instead of over the next day. A forced
fleet-add-missing-packs item is the second lever, same command, its own Context.

**`fleet-update` reports outcomes, not dispatches.** A dispatch POST returning 204 says a
run was queued and nothing more, and a report built from those 204s describes the sweep's own outgoing
calls while reading as fleet-wide delivery. So after firing, the sweep
follows each member until its own declaration stamps the engine and every declared pack at the versions
canon publishes, and reports each as `updated`, `already-current`, `did-not-update`, `never-started`
or `unknown`. A member already at canon's versions is a success in its own right: its update correctly
declines, and it does no work. *Current* is a claim about **published version numbers** — canon content
that shipped without a version bump moves no number and is invisible to it, which the report says itself.

[follow-to-current.mjs](tasks/fleet-update/follow-to-current.mjs) polls a real terminal condition:
each member leaves the loop the moment it reads current, so an already-current fleet finishes
on the first pass in seconds, and the lever stays an ordinary queue task.

Each sweep lives **inside its task's folder**, because nothing outside that task uses it. Only what
they all share sits at the pack root: [fleet-api.mjs](fleet-api.mjs) (the cross-repo REST
primitives, including the one that fires a member's scheduler),
[fleet-config.mjs](fleet-config.mjs) (the one reader of this pack's entry `config`) and
[fleet-token.mjs](fleet-token.mjs) (the one statement of what `FLEET_GITHUB_TOKEN` must be granted —
every "token is not set" message, the adoption handover step and a `403`'s hint are rendered from its
table, so no sweep ever states a subset of its own).

The rest of the machinery — running the daily-run, the task engine (`packs/claudinite-tasks/`), scheduling —
is Claudinite **core**. What a session in an enforcer repo has to get right: [RULES.md](RULES.md).

## Config

The enforcer's `.claudinite-settings.json` carries, as its `packs` entry for this pack:

```json
{ "id": "claudinite-fleet-sheepdog", "config": { "owner": "missingbulb", "kind": "user", "exclude": ["owner/repo-a"],
                                "canonRepo": "missingbulb/Claudinite",
                                "packSeeds": [{ "id": "<a pack>", "config": { … } }] } }
```

| key | default | what it is |
|---|---|---|
| `owner` | this repo's owner | whose repositories make up the fleet |
| `kind` | `"user"` | org support is a later addition |
| `exclude` | none | the repos deliberately kept out, a full `owner/name` each |
| `canonRepo` | `<owner>/Claudinite` | what a member's installed versions are measured against — named rather than inferred, because a version tells you nothing about where it came from |
| `packSeeds` | none | what this fleet wants every member to declare, each `{ id, config? }`. The **only** place a pack is named: the sweep carries the mechanism, the fleet carries the choice |

Every key defaults, so an existing claudinite-fleet-sheepdog config keeps working untouched.
[fleet-config.mjs](fleet-config.mjs) is the one reader of all of it.

## How the tasks are wired

Ordinary **pack tasks**, not fleet mechanisms. Their *implementation* — an account-spanning PAT —
happens to scan every repo under the owner, but their declaration, scheduling and lifecycle are
exactly those of any pack task. None declares the `fleet` signal: the cross-repo reach lives in the
implementation, never in how a task is wired.

| task | when it runs | agent | outcome |
|---|---|---|---|
| `fleet-roster` | `due:daily` | none | none |
| `fleet-add-missing-packs` | `due:weekly` (forceable) | none | none |
| `fleet-pack-seeds` | `due:daily` | none | none |
| `fleet-update` | never — no `preconditions`; only from an item the owner creates | none | none |

The cadences follow what each question can change on. Roster is daily on its coverage question, and
its freshness half rides along rather than gating on a weekly clock it would have to compute; pack
seeds is daily because a member becomes writable the moment its nightly converge vendors the pack,
which makes daily mean "the next morning".

Every ceiling here is `none`. The pack-seed sweep's write goes to **other** repos, and the ceiling
describes what a task may do to its own. What only a repo edit can finish is the member's own
adopt-requested-packs task's, which opens the PR and lands it unattended *there*.

There is **no coverage workflow**: preprocessing runs Action-side inside the repo's one scheduler
workflow, where the Actions secret is already reachable, and each task's
`code_work_required_secrets: ['FLEET_GITHUB_TOKEN']` stamps the name into that workflow's env — which is what
asks the owner for it. A workflow that exists only to hold a secret is redundant
([the writing-tasks skill](../claudinite-growth/skills/writing-tasks/SKILL.md)).

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Acting on an add-packs work-list issue | high | correctness | prose: <100 words |
| Acting on a scanned pack suggestion | medium | correctness | prose: <100 words |
| Reading unknown in a report | high | correctness | prose: <100 words |
| Judging whether a member is behind | high | correctness | prose: <100 words |
| Answering why the fleet did not move | medium | complexity | prose: <100 words |
| Pushing canon to the whole fleet now | low | complexity | prose: <200 words |
| Adding a pack across the fleet | medium | complexity | prose: <100 words |
| Granting or repairing FLEETGITHUBTOKEN | high | correctness | prose: <100 words |
| A sweep reporting 403 or no-permission | medium | complexity | prose: <50 words |

The config rules (`exclude`, `packSeeds`, the declaration a seed must agree with) are the
[`configuring-the-fleet`](skills/configuring-the-fleet/SKILL.md) skill, forced for
`.claudinite-settings.json`.

## Skills

| Skill | Trigger |
|---|---|
| [`configuring-the-fleet`](skills/configuring-the-fleet/SKILL.md) | any edit of `.claudinite-settings.json` in the fleet-enforcer repo — held by the guard until loaded |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `fleet-pack-seed-agrees` | medium | correctness | check: blocking |
