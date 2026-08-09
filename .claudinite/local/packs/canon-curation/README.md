# canon-curation

Claudinite's own curation duties — the fleet-facing work only **Claudinite** runs: promoting
members' lessons into the shared canon, sweeping the fleet's stacks for technologies the canon does
not yet home, and policing the corpus's `packs/` tree. (The
prose-to-checks backlog sweep is no longer canon-only — it moved to
[grow_with_claudinite](../../../../packs/grow_with_claudinite/README.md) as a per-repo task with a
`pack_paths` config, so every repo sweeps its own packs and Claudinite also its core `packs/`.) A
**local pack** of the canon home
(`.claudinite/local/packs/`, by owner decision 2026-07-19: Claudinite-maintaining-Claudinite is
project-specific content, so it lives on the home's own capture surface, not in the portable
canon): `detect: null`, never seeded by `--init` or any migration, declared by hand in exactly one
repo — the canon home itself, as `local/canon-curation`. Its `tasks/<name>/` folders are found by
the home repo's own scheduler exactly like a canon pack's.

**Declaration cardinality is the mechanism.** A pack's tasks run once per *declaring* repo, so a
pack only the home repo declares yields exactly one dispatch per task per slot — "central, once"
with no bespoke orchestrator step. Un-declaring the pack freezes canon absorption without touching
the members' side ([grow_with_claudinite](../../../../packs/grow_with_claudinite/README.md)).

| Task | Runs when | Where it lands |
|---|---|---|
| `growth-promote` | a participating member changed its local packs in the window | a PR against Claudinite's `main` |
| `growth-discover-packs` | weekly, over every covered member | a PR against Claudinite's `main` |
| `migrations-retire` | a fully-applied migration record has passed its TTL | a PR against Claudinite's `main` |

| Rule (≤5 words) | How enforced |
|---|---|
| Pack prose: no enforcement narration | check `pack-no-enforcement-narration` |
| Packs import only own + engine | contributed barrier `pack-independence` ([pack-independence.mjs](pack-independence.mjs) — pure data; the [barriers pack](../../../../packs/barriers/README.md) builds the rule) |

- **[tasks/growth-promote/](tasks/growth-promote/task.md)** — the growth lifecycle's central stage: read the changed members'
  local packs, **generalize** the portable lessons, route each to the right canon home, and open a
  PR for the owner to approve. When a portable lesson's technology has no pack home, it mints a
  fingerprinted **stub pack** (in its own dedicated PR). This is the sole judgment gate before
  shared canon.
- **[tasks/growth-discover-packs/](tasks/growth-discover-packs/task.md)** — the weekly **fleet sweep** for
  technologies the canon does not yet home: read every member's stack, fold the members into one view
  (so first-sight dedup is free — the third member using a technology is the same gap as the first),
  and open an owner-reviewed PR authoring the missing `packs/<tech>/`. Its per-repo namesake in
  [grow_with_claudinite](../../../../packs/grow_with_claudinite/tasks/growth-discover-packs/task.md)
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
**[grow_with_claudinite](../../../../packs/grow_with_claudinite/README.md)** (member-side: extract + dedup + pack
discovery, seeded, opt-out by removal) and **canon-curation** (this pack, the central stage).

```
EXTRACT   per member    → auto-merging PR against the member's main   (grow_with_claudinite)
PROMOTE   central, once → PR against Claudinite's main                (canon-curation)
DEDUP     per member    → PR against the member's main                (grow_with_claudinite)
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
[extracting-lessons.md](../../../../packs/grow_with_claudinite/extracting-lessons.md).)

**Central execution, no plumbing.** Promote runs from the Claudinite home repo with a fleet-wide
token, so it reads every participating member and opens its canon PR directly here — no
consumer-side Action, no cross-repo PAT, no labelled-issue up-path. The planner hands its gate the
`fleetMembers` aggregate (which members changed, and what they declare), and the gate hands the
worker the changed participants as `targets`.

**This pack's tasks need the fleet executor routine — a second routine, only in this repo.** Both
tasks here declare the **deprecated** task-level `session_scope: 'fleet'` — they are its one
sanctioned holdout ([scheduled-tasks.md](../../../../packs/basics/scheduled-tasks.md)): the canon's
ordinary executor does not hold the fleet, so the second label is what keeps that grant off it, and
the advisory `deprecated-session-scope` findings on these two files are the standing record of the
exception, not drift to fix — so the scheduler files their dispatches under
`ready-for-agent-fleet` rather than `ready-for-agent`, and a *distinct* CCR routine runs them: named
`Claudinite executor - fleet`, fired by the **`ready-for-agent-fleet`** label event, with sources =
this repo **and every participating member** (that cross-repo reach is the whole reason the scope is
split, and is exactly what must stay off an ordinary project's `self` executor). Its launcher prompt
is the ordinary one **plus the scope word**:

```
Execute the Claudinite executor: engine/scheduler/executor.md fleet
```

That last word is load-bearing and easy to lose: `resolve-dispatch.mjs` defaults an unnamed scope to
`self`, so a fleet routine whose prompt omits it declines every dispatch with exit `11` and changes
nothing. The failure is **silent and permanent** — the session stops without commenting, the
scheduler re-arms the issue on its next hourly pass, and the pair repeats forever, so the only
symptom is a `ready-for-agent-fleet` issue that keeps getting re-labeled and never runs. Nothing
repo-side can catch it: like the per-repo executor routine baselining checks by hand, this routine is
CCR config, not a GitHub artifact an Action can see. If promote or discover-packs has quietly stopped
producing anything, read the routine's prompt first.

The session-scoped sibling of this nightly lifecycle — mining a single working session for lessons
— lives with [the growth pack's extract-from-conversations skill](../../../../packs/grow_with_claudinite/skills/extract-from-conversations/SKILL.md)
(applied by the conversation half of its growth-extract daily task over captured logs), and the
member-side method docs (extract, dedup, pack discovery, and how a project's local packs are
identified) live with [grow_with_claudinite](../../../../packs/grow_with_claudinite/README.md).
