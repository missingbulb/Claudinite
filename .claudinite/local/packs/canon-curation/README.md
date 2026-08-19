# canon-curation

Claudinite's own curation duties — the fleet-facing work only **Claudinite** runs: promoting
members' lessons into the shared canon, sweeping the fleet's stacks for technologies the canon does
not yet home, and policing the corpus's `packs/` tree. (The
prose-to-checks backlog sweep is no longer canon-only — it moved to
[claudinite-growth](../../../../packs/claudinite-growth/README.md) as a per-repo task with a
`pack_paths` config, so every repo sweeps its own packs and Claudinite also its core `packs/`.) A
**local pack** of the canon home
(`.claudinite/local/packs/`, by owner decision 2026-07-19: Claudinite-maintaining-Claudinite is
project-specific content, so it lives on the home's own capture surface, not in the portable
canon): `detect: null`, never seeded by `--init` or any migration, declared by hand in exactly one
repo — the canon home itself, as `local/canon-curation`. Its `tasks/<name>/` folders are found by
the home repo's own scheduler exactly like a canon pack's.

**Declaration cardinality is the mechanism.** A pack's tasks run once per *declaring* repo, so a
pack only the home repo declares yields exactly one work item per task per occurrence — "central,
once" with no bespoke orchestrator step. Un-declaring the pack freezes canon absorption without touching
the members' side ([claudinite-growth](../../../../packs/claudinite-growth/README.md)).

| Task | Runs when | Where it lands |
|---|---|---|
| `growth-promote` | a participating member changed its local packs in the window | a PR against Claudinite's `main` |
| `growth-discover-packs` | weekly, over every covered member | a PR against Claudinite's `main`, plus an adopt issue in each member that evidenced the pack |

| Rule (≤5 words) | How enforced |
|---|---|
| Pack prose: no enforcement narration | check `pack-no-enforcement-narration` |
| Pack edit bumps pack version | check `pack-version-bumped` |
| Packs import only own + engine | declared barrier `pack-independence` ([declared-checks.json](declared-checks.json) — a `forbidReferences` entry; the [barriers pack](../../../../packs/barriers/README.md) documents the edge vocabulary) |

- **[tasks/growth-promote/](tasks/growth-promote/task.md)** — the growth lifecycle's central stage: read the changed members'
  local packs, **generalize** the portable lessons, route each to the right canon home, and open a
  PR for the owner to approve. When a portable lesson's technology has no pack home, it mints a
  fingerprinted **stub pack** (in its own dedicated PR). This is the sole judgment gate before
  shared canon.
- **[tasks/growth-discover-packs/](tasks/growth-discover-packs/task.md)** — the weekly **fleet sweep** for
  technologies the canon does not yet home: read every member's stack, fold the members into one view
  (so first-sight dedup is free — the third member using a technology is the same gap as the first),
  and open an owner-reviewed PR authoring the missing `packs/<tech>/`. A pack is authored because
  particular members' files demonstrated it, so each of those members also gets an issue asking it to
  adopt the pack once the PR merges and its mount carries it. Its per-repo namesake in
  [claudinite-growth](../../../../packs/claudinite-growth/tasks/growth-discover-packs/task.md)
  is the other side of that line — it authors a repo's own **local** packs and may never re-create what
  a canon pack homes, so only this task can close a canon gap. (Promote's stub-minting is narrower
  still: one lesson's technology, minted as a seed; this task authors from the whole fleet's usage.)
- **[item-routing.md](item-routing.md)** — the shared worthiness + routing method promote (and an
  owner-requested retrospective pass) defers to, so every decision about admitting and placing an
  item is made the same way.
- **[promote-scope.mjs](promote-scope.mjs)** — the CI write-surface gate on promote's PRs: promote
  may write only under `packs/` and `skills/` (keyed on the `growth-promote` branch prefix).

## The growth lifecycle — three independent stages, no barriers

How a lesson is learned in a consuming project, lifted into the shared canon when it's portable,
and pruned back out of the project once the canon owns it. Two packs split it by who declares them:
**[claudinite-growth](../../../../packs/claudinite-growth/README.md)** (member-side: extract + dedup + pack
discovery, seeded, opt-out by removal) and **canon-curation** (this pack, the central stage).

```
EXTRACT   per member    → auto-merging PR against the member's main   (claudinite-growth)
PROMOTE   central, once → PR against Claudinite's main                (canon-curation)
DEDUP     per member    → PR against the member's main                (claudinite-growth)
```

All three are ordinary, **independent** planner units — there is no barrier and no phase ordering.
Each stage reads only what is already **merged**: promote processes whatever sits on members' mains
when it runs, so a lesson extracted tonight is promoted **tomorrow** night (the extract PR's merge
shows up in the next night's local-pack signal), and reaches other members' dedup once the promote PR
is approved and merged. That approval was always the dominant latency, so the barrier machinery bought little;
if the cadence ever matters, promote can run more often (twice daily, or before and after the
nightly) without any design change.

**Review gates by blast radius, not uniformly.** Promote opens a PR — it's the sole judgment gate
before the shared canon every repo reads, so it always needs a human eye. Dedup opens a PR too — a
wrongful prune deletes a real local lesson. Extract lands through an **auto-merging PR** against the
member's `main` — it writes only that project's own local packs, so it earns a CI gate and a PR trail
but not a human reviewer; auto-merge keeps the fleet's daily lesson-capture from flooding review
requests. (An owner-requested, in-session retrospective delivers a PR for a human to review — see
[extracting-lessons.md](../../../../packs/claudinite-growth/extracting-lessons.md).)

**Central execution, no plumbing.** Promote runs from the Claudinite home repo with a fleet-wide
token, so it reads every participating member and opens its canon PR directly here — no
consumer-side Action, no cross-repo PAT, no labelled-issue up-path. The planner hands its gate the
`fleetMembers` aggregate (which members changed, and what they declare), and the gate hands the
worker the changed participants as `targets`.

**This pack's tasks reach every member, so they name the wider invocation endpoint.** Both tasks
here declare `invocation_endpoint: 'fleet'` — a key into this repo's own
`taskScheduler.endpoints`, mapping to a routine whose sources are this repo **and every
participating member**. That cross-repo reach is the whole reason a second endpoint exists, and is
exactly what must stay off the endpoint an ordinary hand-off calls.

Reach is a property of **which endpoint is called**, and of nothing else: there is no session scope
anywhere in the system, and no label routes a hand-off ([the writing-tasks skill](../../../../packs/claudinite-growth/skills/writing-tasks/SKILL.md)).
The `session_scope: 'fleet'` these tasks used to declare lost its last reader with the slot
scheduler and is gone from both.

The failure mode moved with the mechanism, and moved in the right direction. A misconfigured
endpoint used to be **silent and permanent**: a dispatch label nothing picked up, re-armed hourly,
repeating forever with no comment anywhere. Now the hand-off is a synchronous API call, so an
endpoint this repo has not configured — or one whose token secret is unset — converges the item to
`needs-human` naming what is missing, on the item itself. If promote or discover-packs has quietly
stopped producing anything, read its most recent work item; the reason is written there.

The session-scoped sibling of this nightly lifecycle — mining a single working session for lessons
— lives with [the growth pack's extract-from-conversations skill](../../../../packs/claudinite-growth/skills/extract-from-conversations/SKILL.md)
(applied by the conversation half of its growth-extract daily task over captured logs), and the
member-side method docs (extract, dedup, pack discovery, and how a project's local packs are
identified) live with [claudinite-growth](../../../../packs/claudinite-growth/README.md).
