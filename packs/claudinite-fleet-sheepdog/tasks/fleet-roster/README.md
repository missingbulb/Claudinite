# Fleet roster — one walk, two questions about every repo under the owner

**This task runs no agent.** It is `agent_model: none` with `code-work: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the executor runs as code-work, which calls its sibling in this folder, the sweep ([`check-fleet-roster.mjs`](check-fleet-roster.mjs)). This file is the human-facing record of what that worker does; there is no agent phase.

## What it does

Daily, over the `FLEET_GITHUB_TOKEN` PAT: read this (claudinite-fleet-sheepdog) repo's `claudinite-fleet-sheepdog` pack entry `config` (`owner`, `exclude`, `canonRepo`), read canon's default branch, enumerate every repo that owner owns, and walk it **once** — one declaration read per repo, plus two further reads (scheduler workflow, canon compare) for each member the freshness question actually measures, and canon's own version numbers, read once per distinct pack across the whole walk.

That one roster then answers two questions, each with its own issue family and its own section of the run summary:

| question | module | finding | label |
|---|---|---|---|
| is this repo a **member**? | [`adoption-issues.mjs`](adoption-issues.mjs) | an uncovered repo under the owner | `fleet-adoption` |
| is that membership still **meaning** anything? | [`drift-issues.mjs`](drift-issues.mjs) | a covered member whose mount has fallen behind | `fleet-drift` |

It **reports; it does not repair** — `expected_outcome: none`. Adoption issues open while a repo is uncovered, close `completed` once covered and `not planned` once excluded. Drift issues open while a member is unhealthy, close `completed` once fresh again and `not planned` once the repo leaves the fleet; an already-open one is re-commented only when its **root cause changes**, which is what lets this ride a daily cadence without turning every thread into a wall of identical notes.

## Why one task

These were two — a daily `fleet-census` and a weekly `fleet-freshness` — and each carried its own enumeration, its own owner filter, its own empty-enumeration guard, its own home/canon/archived/fork/excluded skips and its own declaration read per repo. The freshness half's header said it *"takes coverage as given"*, but it could not: the census's verdict lived in another process on another cadence, so it re-derived the whole thing.

That produced divergence in the classification itself. `exclude` was applied at different points, so an excluded repo that still carried a declaration read **covered** to one sweep and **out of scope** to the other. And each half's `unknown` failed its own run knowing nothing of the other's, so one green run beside one red one told a reader nothing about which half of the fleet picture to trust.

One walk means one membership verdict per repo, one report, and one failure boundary. See [#788](https://github.com/missingbulb/Claudinite/issues/788).

## The freshness classification

For each measured member, by **root cause**, in this precedence:

| state | meaning |
|---|---|
| `no-stamp` | declares packs but was never vendored — no engine on disk at all |
| `no-scheduler` | no vendored scheduler workflow, so no cron, so it will never refresh itself; every other symptom is downstream of this |
| `ref-not-on-trunk` | the stamped ref is not a canon commit, or not an ancestor of canon's default branch — vendoring's #328 anti-rewind guard refuses to write, so the repo is **wedged**, not merely late |
| `behind` | on trunk, but its stamped `engineVersion` is below canon's or a pack it stamps is below that pack's manifest version in canon — the self-refresh has stopped landing |
| `fresh` | every version it stamps is at canon's |

### What `behind` measures, and what it deliberately does not

The **version gap**, and nothing else. The versioned update flows stamp `engineVersion` and `packVersions` and never rewrite `ref` or `updated`, so on a well-maintained member the stamped ref is frozen at whatever commit first vendored the mount: it is provenance, and its **age** measures nothing. Worse, it does not decay gracefully — every member's ref ages at the same rate, so one arbitrary day the whole fleet crosses any date window at once and the sweep files a drift issue per repo for a fleet that is, by versions, current ([#1025](https://github.com/missingbulb/Claudinite/issues/1025)).

The numbers are read out of **canon** over the API — `engine/version.mjs` and each `packs/<id>/pack.mjs` — never out of the enforcer's own mount, which is itself a member and can be behind. A pack canon no longer carries has no manifest to be behind, so it contributes no gap; an absent number never reads as zero. A stamp carrying neither number is behind by construction: an engine that stamps always stamps.

The stamped ref is still read, for the one thing it honestly says — whether it is a commit on canon's trunk at all, which is the `ref-not-on-trunk` wedge.

## Who is measured by which question

Every repo lands in exactly one bucket per question, and the two disagree on purpose:

- **The enforcer** is censused by neither — it is named in both summaries and swept by its own scheduler.
- **Canon** is an ordinary covered member to the coverage question (it carries a declaration) and is never measured by the freshness one (it has no vendored mount to be stale).
- **An excluded repo** that still carries a declaration is **covered** — saying otherwise would report a repo as missing something it has — and is **out of scope** for freshness, because upkeep is what the exclusion opted out of.
- **A dormant member** (`"dormant": true`, [the scheduler's gate](../../../claudinite-tasks/skills/writing-tasks/SKILL.md)) is a covered member with no freshness verdict: its stamp is never read, and any open drift issue for it closes *not planned*. Its scheduler is stopped, so its mount falls behind **by design**. The test is `isDormant`, re-exported from the engine rather than re-implemented — a sweep with a private notion of dormancy would nag exactly the repos that had already opted out.

## Why daily, and what it costs

The freshness question was weekly because drift is measured in days and a daily re-ask could not change its answer. Merged, that argument buys nothing: the walk runs daily for the coverage question regardless, and gating half the task on a cadence it computed itself would reimplement dueness — which the engine owns (the scheduler run instantiates a task's item when its anchor comes) and is not something a task can ask about from inside itself.

So the freshness probe runs daily too, at roughly **two extra REST reads per covered member** on the six days that used to be coverage-only. **This merge is not an API-call saving and is not claimed as one.** What it buys is one roster instead of two that can disagree; drift converging within a day rather than a week is the side benefit.

## Not a fleet mechanism

Its *implementation* scans every repo under the owner, but its declaration, scheduling and lifecycle are those of **any pack task**: it is active because this repo declares the `claudinite-fleet-sheepdog` pack, and it runs on this repo's ordinary scheduler. It declares no `fleet` signal and no `fleet` session scope — the cross-repo reach lives in the implementation, never in the wiring.

## Failure is loud, and now per-question

A repo whose **declaration** cannot be read or parsed is `unknown` to **both** questions — it is the input they share. A repo whose **mount probe** fails (the scheduler read, canon's compare, canon's version numbers) is `unknown` to the **freshness** question alone: the coverage question already read that declaration successfully and keeps its verdict.

Either kind fails the run: no issue is opened for an unknown repo, no open issue is closed on its behalf, and the sweep exits non-zero with both halves' unknowns named together. The executor treats a non-zero code-work subprocess as a failed task and converges the item to `needs-human`, so an unusable token or scope escalates rather than silently shrinking the fleet.
