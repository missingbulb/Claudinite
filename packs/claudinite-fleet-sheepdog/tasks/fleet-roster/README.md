# Fleet roster — one walk, two questions about every repo under the owner

**This task runs no agent.** It is `agent_model: none` with `code-work: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the executor runs as code-work, which calls its sibling in this folder, the sweep ([`check-fleet-roster.mjs`](check-fleet-roster.mjs)). This file is the human-facing record of what that worker does; there is no agent phase.

## What it does

Daily, over the `FLEET_GITHUB_TOKEN` PAT: read this (claudinite-fleet-sheepdog) repo's `claudinite-fleet-sheepdog` pack entry `config` (`owner`, `exclude`, `canonRepo`), read canon's default branch, enumerate every repo that owner owns, and walk it **once** — one declaration read per repo, plus two further reads (scheduler workflow, canon compare) for each member the freshness question actually measures, and canon's own version numbers, read once per distinct pack across the whole walk.

That one roster then answers two questions, each with its own issue family and its own section of the run summary:

| question | module | finding | where the answer goes |
|---|---|---|---|
| is this repo a **member**? | [`adoption-issues.mjs`](adoption-issues.mjs) | an uncovered repo under the owner | a `fleet-adoption` issue |
| is that membership still **meaning** anything? | [`freshness.mjs`](freshness.mjs) | a covered member whose mount has fallen behind | the run report's freshness section |

It **reports; it does not repair** — `expected_outcome: no_code_changes`. Adoption issues open while a repo is uncovered, close `completed` once covered and `not planned` once excluded.

### Why freshness files no issue

It filed a `fleet-drift` issue per unhealthy member until [#1854](https://github.com/missingbulb/Claudinite/issues/1854). The dashboard's Drift tile answers the same question from the same source — each member's declaration measured against canon — and recomputes on load, so the issue family was a second surface for one fact and the staler of the two: only ever as current as the last daily sweep. A member that fell behind hours after a sweep went unreported while open issues named members that had already caught up.

Coverage still files, because nothing else answers coverage.

## Why one task

These were two — a daily `fleet-census` and a weekly `fleet-freshness` — and each carried its own enumeration, its own owner filter, its own empty-enumeration guard, its own home/canon/archived/fork/excluded skips and its own declaration read per repo. The freshness half's header said it *"takes coverage as given"*, but it could not: the census's verdict lived in another process on another cadence, so it re-derived the whole thing.

That produced divergence in the classification itself. `exclude` was applied at different points, so an excluded repo that still carried a declaration read **covered** to one sweep and **out of scope** to the other. And each half's `unknown` failed its own run knowing nothing of the other's, so one green run beside one red one told a reader nothing about which half of the fleet picture to trust.

One walk means one membership verdict per repo, one report, and one failure boundary. See [#788](https://github.com/missingbulb/Claudinite/issues/788).

## The freshness classification

For each measured member, by **root cause**, in this precedence:

| state | meaning | what fixes it |
|---|---|---|
| `no-stamp` | declares packs but was never vendored — no engine on disk at all | run the adoption flow (the `adopt-claudinite` skill): it vendors the mount and writes the first versions. Until then the declaration names packs whose code is not present, so nothing Claudinite defines actually runs there. |
| `no-scheduler` | no vendored scheduler workflow, so no cron, so it will never refresh itself; every other symptom is downstream of this | the repo never cut over to per-project scheduling. Vendor the scheduler (`vendoring/apply-vendor-set.mjs` writes it, with the repo's hashed cron minute) and confirm the workflow is enabled in the Actions tab. |
| `ref-not-on-trunk` | the stamped ref is not a canon commit, or not an ancestor of canon's default branch — vendoring's #328 anti-rewind guard refuses to write, so the repo is **wedged**, not merely late | the ref has to be brought back onto canon's trunk before any vendor write can land. |
| `behind` | on trunk, but its stamped `engineVersion` is below canon's or a pack it stamps is below that pack's manifest version in canon — the self-refresh has stopped landing | read the member's recent `Claudinite scheduler` runs: a disabled workflow (GitHub disables cron after 60 days of no activity), a failing update task, or a maintenance PR that never merges all look like this. The gap closes only when an update flow actually re-stamps the mount. |
| `fresh` | every version it stamps is at canon's | — |

A **dormant** member behind canon is reported with that noted beside its verdict: none of the remedies above apply on their own, because nothing there is meant to be running. It clears when someone wakes the repo, baselines it deliberately, or retires it.

### What `behind` measures, and what it deliberately does not

The **version gap**, and nothing else. The versioned update flows stamp `engineVersion` and `packVersions` and never rewrite `ref` or `updated`, so on a well-maintained member the stamped ref is frozen at whatever commit first vendored the mount: it is provenance, and its **age** measures nothing. Worse, it does not decay gracefully — every member's ref ages at the same rate, so one arbitrary day the whole fleet crosses any date window at once and the sweep calls every repo behind for a fleet that is, by versions, current ([#1025](https://github.com/missingbulb/Claudinite/issues/1025)).

The numbers are read out of **canon** over the API — `engine/version.mjs` and each `packs/<id>/pack.mjs` — never out of the enforcer's own mount, which is itself a member and can be behind. A pack canon no longer carries has no manifest to be behind, so it contributes no gap; an absent number never reads as zero. A stamp carrying neither number is behind by construction: an engine that stamps always stamps.

The stamped ref is still read, for the one thing it honestly says — whether it is a commit on canon's trunk at all, which is the `ref-not-on-trunk` wedge.

## Who is measured by which question

Every repo lands in exactly one bucket per question, and the two disagree on purpose:

- **The enforcer** is censused by neither — it is named in both summaries and swept by its own scheduler.
- **Canon** is an ordinary covered member to the coverage question (it carries a declaration) and is never measured by the freshness one (it has no vendored mount to be stale).
- **An excluded repo** that still carries a declaration is **covered** — saying otherwise would report a repo as missing something it has — and is **out of scope** for freshness, because upkeep is what the exclusion opted out of.
- **A dormant member** (`dormant` on its `claudinite-tasks` entry, [the scheduler's gate](../../../claudinite-growth/skills/writing-tasks/SKILL.md)) is a covered member measured like any other: its stamp is read and its version gap classified on the same terms. Dormancy stops its scheduler, not its clock. The one thing it suppresses is the `no-scheduler` verdict — a member told to stop is not then reported for having stopped — and the report says beside its verdict that the gap will not close on its own, since the fan-out leaves dormant members alone. The test is `isDormant`, re-exported from the tasks pack rather than re-implemented, so the sweep and that member's own scheduler cannot disagree.

## Why daily, and what it costs

The freshness question was weekly because drift is measured in days and a daily re-ask could not change its answer. Merged, that argument buys nothing: the walk runs daily for the coverage question regardless, and gating half the task on a cadence it computed itself would reimplement dueness — which the engine owns (the scheduler run instantiates a task's item when its anchor comes) and is not something a task can ask about from inside itself.

So the freshness probe runs daily too, at roughly **two extra REST reads per covered member** on the six days that used to be coverage-only. **This merge is not an API-call saving and is not claimed as one.** What it buys is one roster instead of two that can disagree; the freshness verdict refreshing within a day rather than a week is the side benefit.

## Not a fleet mechanism

Its *implementation* scans every repo under the owner, but its declaration, scheduling and lifecycle are those of **any pack task**: it is active because this repo declares the `claudinite-fleet-sheepdog` pack, and it runs on this repo's ordinary scheduler. It declares no `fleet` signal and no `fleet` session scope — the cross-repo reach lives in the implementation, never in the wiring.

## Failure is loud, and now per-question

A repo whose **declaration** cannot be read or parsed is `unknown` to **both** questions — it is the input they share. A repo whose **mount probe** fails (the scheduler read, canon's compare, canon's version numbers) is `unknown` to the **freshness** question alone: the coverage question already read that declaration successfully and keeps its verdict.

Either kind fails the run: no issue is opened for an unknown repo, no open issue is closed on its behalf, and the sweep exits non-zero with both halves' unknowns named together. The executor treats a non-zero code-work subprocess as a failed task and parks the item, so an unusable token or scope escalates rather than silently shrinking the fleet.

## Why the declaration reads as it does

Carried over from the declaration's comments when it became `task.json`.

claudinite-fleet-sheepdog task: fleet-roster — one walk of the fleet answering the enforcer's two
standing questions about every repo under the owner (#788):

  is this repo a MEMBER?                        → `fleet-adoption` issues
  is that membership still MEANING anything?    → the run report's freshness section

`agent_model: 'none'` with `code_work: 'node worker.mjs'`: the whole pass is
deterministic code the executor runs as code-work — no agent phase.
The worker calls its sibling, the sweep (check-fleet-roster.mjs), which enumerates
the fleet once, reads each repo's declaration once, and hands the resulting roster to
the two questions' modules (adoption-issues.mjs, freshness.mjs).

WHY ONE TASK. These were two — a daily `fleet-census` and a weekly `fleet-freshness`
— and each carried its own enumeration, its own structural skips and its own
declaration read per repo. The freshness half's own header said it "takes coverage as
given" while in fact re-deriving it on another cadence in another process, so the two
classifications could disagree and did. One walk means one membership verdict per
repo, one report, and one failure boundary.

WHY DAILY, and what it costs. The freshness question was weekly because drift is
measured in DAYS and a daily re-ask could not change its answer. Merged, that
argument buys nothing: the walk runs daily for the coverage question regardless, and
the alternative — half the task gated on a weekly cadence it computed itself — would
reimplement dueness, which the engine owns (the scheduler run instantiates a task's item
when its anchor comes) and which is not a thing a task can ask about from inside
itself. So the freshness probe now runs daily too: roughly two extra REST
reads per covered member on the six days that used to be coverage-only. The merge is
not an API-call saving and is not claimed as one — what it buys is one roster instead
of two that can disagree. The freshness verdict refreshing within a day rather than a
week is the side benefit.

CLASSIFICATION (per-project-scheduling DESIGN §6, the same note RULES.md carries):
this is an ORDINARY PACK TASK, not a fleet mechanism. Its *implementation* happens to
scan every repo under the owner over a PAT, but its declaration, scheduling and
lifecycle are exactly those of any pack task — it is active because this repo declares
the claudinite-fleet-sheepdog pack, and it runs however this repo's tasks run. Hence no `fleet` signal
and no session scope of its own (the PACK declares the executor reach): those describe
how a task is WIRED, and nothing about this task's wiring is fleet-shaped. The
cross-repo reach lives in the implementation, never in the declaration.

A daily sweep with nothing repo-side to gate on: coverage and freshness are
facts about OTHER repos, and the walk no-ops cheaply on a converged fleet.
The walk covers EVERY repo in the fleet: one paged enumeration, one declaration
read per repo, two further reads per measured member (scheduler workflow, canon
compare), then the coverage convergence — all serial, and a secondary rate limit
makes it slower still. The same 900s both predecessors carried: ~10x the expected
walk while staying well inside the hourly scheduler cadence, so a hung sweep is
killed long before the next run could collide with it.
